/**
 * Provider-neutral storage operations that run against a built `FilesClient`.
 *
 * This module is isomorphic: it must stay free of `"use server"`, `"server-only"`,
 * and any `files-sdk` *value* import (types only), so it can be pulled into both
 * the server actions and the browser's direct-request path. Error normalization
 * is therefore duck-typed rather than using `instanceof FilesError`.
 */
import type {
  EntryRef,
  FilesClient,
  SignedUpload,
} from "@/lib/storage/files-client"
import type {
  FileSystemItem,
  FileSystemLoadChildrenResult,
} from "@/components/explorer/types"

export type { EntryRef, SignedUpload }

const PAGE_LIMIT = 1000
const URL_EXPIRES_IN = 3600

/** Normalize any thrown value to an `Error`, appending a `files-sdk` code. */
export function normalizeError(error: unknown): Error {
  if (
    error &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "FilesError"
  ) {
    const { message, code } = error as { message?: string; code?: string }
    return new Error(`${message ?? "Storage error"} (${code ?? "unknown"})`)
  }
  if (error instanceof Error) return error
  return new Error(String(error))
}

/** Duck-typed adapter check — this module must stay free of sdk value imports. */
function isWebdavAdapter(files: FilesClient): boolean {
  return (files as { adapter?: { name?: string } }).adapter?.name === "webdav"
}

function parentPath(path: string) {
  const normalized = path.endsWith("/") ? path.slice(0, -1) : path
  const separatorIndex = normalized.lastIndexOf("/")
  return separatorIndex < 0 ? "" : normalized.slice(0, separatorIndex + 1)
}

async function listKeys(files: FilesClient, prefix: string) {
  const keys: string[] = []
  for await (const item of files.listAll({ prefix })) {
    keys.push(item.key)
  }
  return keys
}

async function prefixExists(files: FilesClient, prefix: string) {
  for await (const _item of files.listAll({ prefix })) return true
  return false
}

async function keyExists(files: FilesClient, key: string) {
  for await (const item of files.listAll({ prefix: key })) {
    if (item.key === key) return true
  }
  return false
}

/** One page of a folder, mapped to the FileSystem manifest shape. */
export async function listFolder(
  files: FilesClient,
  prefix: string,
  cursor: string | null
): Promise<FileSystemLoadChildrenResult> {
  try {
    const result = await files.list({
      prefix: prefix || undefined,
      delimiter: "/",
      limit: PAGE_LIMIT,
      cursor: cursor ?? undefined,
    })

    const folders: FileSystemItem[] = (result.prefixes ?? []).map((path) => ({
      kind: "folder",
      path,
      hasChildren: true,
    }))

    const fileItems: FileSystemItem[] = result.items
      // Skip the zero-byte "folder marker" objects some tools create.
      .filter((file) => !file.key.endsWith("/"))
      .map((file) => ({
        kind: "file",
        path: file.key,
        key: file.key,
        size: file.size,
        contentType: file.type || undefined,
        updatedAt: file.lastModified
          ? new Date(file.lastModified).toISOString()
          : undefined,
        etag: file.etag,
      }))

    // WebDAV: the adapter derives prefixes from file keys, so directories
    // with no file descendants never surface. Merge them in from a depth-1
    // PROPFIND of the current folder. First page only — a follow-up cursor
    // page would re-add the same folders.
    const adapter = (files as { adapter?: { name?: string; root?: string } })
      .adapter
    if (adapter?.name === "webdav" && !cursor) {
      try {
        const known = new Set(folders.map((folder) => folder.path))
        for (const path of await listWebdavEmptyFolders(
          files,
          adapter.root ?? "/",
          prefix
        )) {
          if (!known.has(path)) {
            folders.push({ kind: "folder", path, hasChildren: true })
          }
        }
      } catch {
        // Best-effort: an empty-directory PROPFIND failure must not fail the
        // listing itself (e.g. the folder vanished between the two calls).
      }
    }

    return {
      items: [...folders, ...fileItems],
      nextCursor: result.cursor ?? null,
    }
  } catch (error) {
    throw normalizeError(error)
  }
}

/**
 * Immediate empty directories under a WebDAV folder, as `"name/"` keys. The
 * sdk's `list` only ever reports folders that contain files, so these would
 * otherwise be invisible right after `createFolder`.
 */
async function listWebdavEmptyFolders(
  files: FilesClient,
  root: string,
  prefix: string
): Promise<string[]> {
  const raw = (files as { raw?: unknown }).raw as
    | {
        getDirectoryContents?: (
          path: string,
          options?: { details?: boolean }
        ) => Promise<
          Array<{ type?: string; basename?: string; filename?: string }>
        >
      }
    | null
    | undefined
  if (!raw?.getDirectoryContents) return []

  const entries = await raw.getDirectoryContents(
    webdavRemotePath(root, prefix),
    { details: false }
  )

  const base = prefix.endsWith("/") ? prefix : prefix ? `${prefix}/` : ""
  const folders: string[] = []
  for (const entry of entries) {
    if (entry.type !== "directory") continue
    const name = entry.basename ?? entry.filename?.split("/").pop() ?? ""
    if (!name || name === "." || name === "..") continue
    folders.push(`${base}${name}/`)
  }
  return folders
}

/** Map a virtual prefix to the server-side path, mirroring the adapter's `keyToRemote`. */
function webdavRemotePath(root: string, prefix: string): string {
  const absolute = root.startsWith("/")
  const rootInner = root === "." ? "" : root.replace(/^\/+|\/+$/g, "")
  const inner = prefix.replace(/^\/+|\/+$/g, "")
  if (!rootInner) {
    return absolute ? (inner ? `/${inner}` : "/") : inner
  }
  const base = `${absolute ? "/" : ""}${rootInner}`
  return inner ? `${base}/${inner}` : base
}

/** Presigned GET URL for previewing/downloading a single object. */
export async function signFileUrl(
  files: FilesClient,
  key: string
): Promise<string> {
  try {
    return await files.url(key, { expiresIn: URL_EXPIRES_IN })
  } catch (error) {
    throw normalizeError(error)
  }
}

/** Batched presign. A key that fails is omitted rather than failing the batch. */
export async function signFileUrls(
  files: FilesClient,
  keys: string[]
): Promise<Record<string, string>> {
  const signed = await Promise.all(
    keys.map(async (key) => {
      try {
        return [
          key,
          await files.url(key, { expiresIn: URL_EXPIRES_IN }),
        ] as const
      } catch {
        return [key, null] as const
      }
    })
  )

  const urls: Record<string, string> = {}
  for (const [key, url] of signed) {
    if (url) urls[key] = url
  }
  return urls
}

/** Presigned direct-upload descriptor for a browser-to-storage transfer. */
export async function signUploadUrl(
  files: FilesClient,
  key: string,
  contentType?: string
): Promise<SignedUpload> {
  try {
    return (await files.signedUploadUrl(key, {
      expiresIn: URL_EXPIRES_IN,
      contentType: contentType || undefined,
    })) as SignedUpload
  } catch (error) {
    throw normalizeError(error)
  }
}

/** Create an object-store folder marker at a path ending in `/`. */
export async function createFolder(
  files: FilesClient,
  path: string
): Promise<void> {
  const key = path.endsWith("/") ? path : `${path}/`
  try {
    // WebDAV has no folder markers — a trailing-slash PUT would hit the
    // collection URL, which most servers reject. Issue an MKCOL through the
    // adapter's raw client instead.
    if (isWebdavAdapter(files)) {
      const client = (files as { raw?: unknown }).raw as
        | {
            createDirectory?: (
              dirPath: string,
              options?: { recursive?: boolean }
            ) => Promise<unknown>
          }
        | null
        | undefined
      if (!client?.createDirectory) {
        throw new Error("WebDAV client unavailable.")
      }
      await client.createDirectory(key, { recursive: true })
      return
    }

    await files.upload(key, new Uint8Array(), {
      contentType: "application/x-directory",
    })
  } catch (error) {
    throw normalizeError(error)
  }
}

/** Delete a file or recursively delete every object under a folder. */
export async function deleteEntry(
  files: FilesClient,
  item: EntryRef
): Promise<void> {
  try {
    if (item.kind === "file") {
      await files.delete(item.key ?? item.path)
      return
    }

    const prefix = item.path.endsWith("/") ? item.path : `${item.path}/`
    // WebDAV deletes collections in one native DELETE (recursive per RFC
    // 4918) — deleting only the files would leave empty directories behind.
    if (isWebdavAdapter(files)) {
      await files.delete(prefix)
      return
    }

    const keys = await listKeys(files, prefix)
    if (keys.length === 0) return

    const result = await files.delete(keys)
    if (result.errors?.length) {
      throw new Error(
        `Could not delete ${result.errors.length} object${result.errors.length === 1 ? "" : "s"}.`
      )
    }
  } catch (error) {
    throw normalizeError(error)
  }
}

/** Rename a file or recursively move every object under a folder. */
export async function renameEntry(
  files: FilesClient,
  item: EntryRef,
  name: string
): Promise<void> {
  const nextName = name.trim()
  if (!nextName) throw new Error("Enter a name.")

  try {
    if (item.kind === "file") {
      const sourceKey = item.key ?? item.path
      const destinationKey = `${parentPath(sourceKey)}${nextName}`

      if (destinationKey === sourceKey) return
      if (
        (await keyExists(files, destinationKey)) ||
        (await prefixExists(files, `${destinationKey}/`))
      ) {
        throw new Error("An item with this name already exists.")
      }

      await files.move(sourceKey, destinationKey)
      return
    }

    const sourcePrefix = item.path.endsWith("/") ? item.path : `${item.path}/`
    const destinationPrefix = `${parentPath(sourcePrefix)}${nextName}/`

    if (destinationPrefix === sourcePrefix) return
    if (
      (await keyExists(files, destinationPrefix.slice(0, -1))) ||
      (await prefixExists(files, destinationPrefix))
    ) {
      throw new Error("An item with this name already exists.")
    }

    // WebDAV moves collections natively in one MOVE — and it covers empty
    // folders, which the per-object loop below cannot (no keys to move).
    if (isWebdavAdapter(files)) {
      await files.move(sourcePrefix, destinationPrefix)
      return
    }

    const keys = await listKeys(files, sourcePrefix)
    if (keys.length === 0) throw new Error("This folder no longer exists.")

    for (let index = 0; index < keys.length; index += 8) {
      await Promise.all(
        keys
          .slice(index, index + 8)
          .map((sourceKey) =>
            files.move(
              sourceKey,
              `${destinationPrefix}${sourceKey.slice(sourcePrefix.length)}`
            )
          )
      )
    }
  } catch (error) {
    throw normalizeError(error)
  }
}

/** Move a file or folder into another folder (`""` is the bucket root). */
export async function moveEntry(
  files: FilesClient,
  item: EntryRef,
  destinationFolder: string
): Promise<void> {
  // Normalize the destination to "" (root) or a "prefix/" form.
  const destination =
    !destinationFolder || destinationFolder.endsWith("/")
      ? destinationFolder
      : `${destinationFolder}/`

  try {
    if (item.kind === "file") {
      const sourceKey = item.key ?? item.path
      const name = sourceKey.slice(parentPath(sourceKey).length)
      const destinationKey = `${destination}${name}`

      if (destinationKey === sourceKey) return
      if (
        (await keyExists(files, destinationKey)) ||
        (await prefixExists(files, `${destinationKey}/`))
      ) {
        throw new Error("An item with this name already exists there.")
      }

      await files.move(sourceKey, destinationKey)
      return
    }

    const sourcePrefix = item.path.endsWith("/") ? item.path : `${item.path}/`
    const folderName = sourcePrefix
      .slice(parentPath(sourcePrefix).length)
      .replace(/\/$/, "")
    const destinationPrefix = `${destination}${folderName}/`

    if (destinationPrefix === sourcePrefix) return
    if (destinationPrefix.startsWith(sourcePrefix)) {
      throw new Error("Can’t move a folder into itself.")
    }
    if (
      (await keyExists(files, destinationPrefix.slice(0, -1))) ||
      (await prefixExists(files, destinationPrefix))
    ) {
      throw new Error("An item with this name already exists there.")
    }

    // Native collection MOVE — also moves empty folders.
    if (isWebdavAdapter(files)) {
      await files.move(sourcePrefix, destinationPrefix)
      return
    }

    const keys = await listKeys(files, sourcePrefix)
    if (keys.length === 0) throw new Error("This folder no longer exists.")

    for (let index = 0; index < keys.length; index += 8) {
      await Promise.all(
        keys
          .slice(index, index + 8)
          .map((sourceKey) =>
            files.move(
              sourceKey,
              `${destinationPrefix}${sourceKey.slice(sourcePrefix.length)}`
            )
          )
      )
    }
  } catch (error) {
    throw normalizeError(error)
  }
}

/**
 * Collect the object keys to bundle for a folder download: everything under
 * `prefix`, minus the marker itself and any zero-byte folder markers.
 */
export async function collectZipKeys(
  files: FilesClient,
  prefix: string
): Promise<string[]> {
  const keys: string[] = []
  for await (const item of files.listAll({ prefix })) {
    if (item.key !== prefix && !item.key.endsWith("/")) keys.push(item.key)
  }
  return keys
}
