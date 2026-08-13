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

type WebdavEntry = {
  basename?: string
  filename?: string
  type?: string
  size?: number
  lastmod?: string
  etag?: string | null
  mime?: string
}

type WebdavRawClient = {
  createDirectory?: (
    path: string,
    options?: { recursive?: boolean }
  ) => Promise<unknown>
  getDirectoryContents?: (
    path: string,
    options?: { details?: boolean }
  ) => Promise<WebdavEntry[]>
  stat?: (path: string) => Promise<unknown>
  customRequest?: (
    path: string,
    options: {
      method: string
      data?: unknown
      headers?: Record<string, string>
    }
  ) => Promise<unknown>
}

/**
 * The raw `webdav` client plus the adapter's configured root, or `null` for
 * every other adapter. Duck-typed — this module must stay free of sdk value
 * imports. Paths passed to the raw client are server-side paths, so they must
 * go through {@link webdavRemotePath}; the adapter's own methods take virtual
 * keys and apply the root themselves.
 */
function webdavContext(
  files: FilesClient
): { client: WebdavRawClient; root: string } | null {
  const adapter = (files as { adapter?: { name?: string; root?: string } })
    .adapter
  if (adapter?.name !== "webdav") return null

  const client = (files as { raw?: WebdavRawClient | null }).raw
  if (!client) throw new Error("WebDAV client unavailable.")
  return { client, root: adapter.root ?? "/" }
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

/**
 * Whether a rename/move destination is already occupied.
 *
 * On WebDAV a single PROPFIND answers for files and collections alike — and it
 * is the only thing that sees an *empty* directory, which a native MOVE would
 * otherwise silently destroy (RFC 4918 defaults to `Overwrite: T`).
 */
async function destinationTaken(files: FilesClient, path: string) {
  const webdav = webdavContext(files)
  if (webdav) return webdavPathExists(webdav, path)
  return (
    (await keyExists(files, path)) || (await prefixExists(files, `${path}/`))
  )
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
  const webdav = webdavContext(files)
  if (webdav) {
    try {
      return await listWebdavFolder(webdav, prefix)
    } catch (error) {
      throw normalizeError(error)
    }
  }

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

    return {
      items: [...folders, ...fileItems],
      nextCursor: result.cursor ?? null,
    }
  } catch (error) {
    throw normalizeError(error)
  }
}

/**
 * One WebDAV folder from a single depth-1 PROPFIND.
 *
 * The sdk's `list` is unusable here: it walks the whole tree from the adapter
 * root on *every* call regardless of `prefix` (listing a one-file folder in a
 * 30-directory tree cost 33 PROPFINDs), and it derives folders from file keys,
 * so empty directories never surface. PROPFIND already returns exactly one
 * level, which is what a folder listing wants.
 */
async function listWebdavFolder(
  { client, root }: NonNullable<ReturnType<typeof webdavContext>>,
  prefix: string
): Promise<FileSystemLoadChildrenResult> {
  if (!client.getDirectoryContents) {
    throw new Error("WebDAV client unavailable.")
  }

  const entries = await client.getDirectoryContents(
    webdavRemotePath(root, prefix),
    { details: false }
  )

  const base = prefix.endsWith("/") ? prefix : prefix ? `${prefix}/` : ""
  const folders: FileSystemItem[] = []
  const fileItems: FileSystemItem[] = []

  for (const entry of entries) {
    const name = entry.basename || entry.filename?.split("/").pop() || ""
    if (!name || name === "." || name === "..") continue

    if (entry.type === "directory") {
      folders.push({
        kind: "folder",
        path: `${base}${name}/`,
        hasChildren: true,
      })
      continue
    }

    const key = `${base}${name}`
    const lastModified = entry.lastmod ? Date.parse(entry.lastmod) : Number.NaN
    fileItems.push({
      kind: "file",
      path: key,
      key,
      size: entry.size,
      contentType: entry.mime || undefined,
      updatedAt: Number.isNaN(lastModified)
        ? undefined
        : new Date(lastModified).toISOString(),
      etag: entry.etag ?? undefined,
    })
  }

  // A depth-1 PROPFIND is the complete folder — there is nothing to page.
  return { items: [...folders, ...fileItems], nextCursor: null }
}

/**
 * Raw client and server-side paths for a streaming PUT, or `null` when the
 * adapter is not WebDAV.
 *
 * `upload()` buffers the whole object before it sends anything, which on a
 * proxied upload splits the transfer into two invisible halves: the browser's
 * progress bar fills while the server is still just collecting bytes, then
 * sits at 100% for the entire upstream leg. Piping the request body straight
 * through makes the two hops one, so the browser's own progress — throttled by
 * upstream backpressure — is the real progress.
 */
export function webdavUploadTarget(
  files: FilesClient,
  key: string
): {
  client: WebdavRawClient
  remotePath: string
  parentRemotePath: string | null
} | null {
  const webdav = webdavContext(files)
  if (!webdav) return null

  const parent = parentPath(key)
  return {
    client: webdav.client,
    remotePath: webdavRemotePath(webdav.root, key),
    parentRemotePath: parent ? webdavRemotePath(webdav.root, parent) : null,
  }
}

/** Whether anything — file or collection — sits at this WebDAV path. */
async function webdavPathExists(
  { client, root }: NonNullable<ReturnType<typeof webdavContext>>,
  path: string
): Promise<boolean> {
  if (!client.stat) return false
  try {
    await client.stat(webdavRemotePath(root, path))
    return true
  } catch (error) {
    if ((error as { status?: number }).status === 404) return false
    throw error
  }
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
    // adapter's raw client instead. The raw client resolves against the base
    // URL, so the key has to be mapped to a server-side path first.
    const webdav = webdavContext(files)
    if (webdav) {
      if (!webdav.client.createDirectory) {
        throw new Error("WebDAV client unavailable.")
      }
      await webdav.client.createDirectory(webdavRemotePath(webdav.root, key), {
        recursive: true,
      })
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
    if (webdavContext(files)) {
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
      if (await destinationTaken(files, destinationKey)) {
        throw new Error("An item with this name already exists.")
      }

      await files.move(sourceKey, destinationKey)
      return
    }

    const sourcePrefix = item.path.endsWith("/") ? item.path : `${item.path}/`
    const destinationPrefix = `${parentPath(sourcePrefix)}${nextName}/`

    if (destinationPrefix === sourcePrefix) return
    if (await destinationTaken(files, destinationPrefix.slice(0, -1))) {
      throw new Error("An item with this name already exists.")
    }

    // WebDAV moves collections natively in one MOVE — and it covers empty
    // folders, which the per-object loop below cannot (no keys to move).
    if (webdavContext(files)) {
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
      if (await destinationTaken(files, destinationKey)) {
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
    if (await destinationTaken(files, destinationPrefix.slice(0, -1))) {
      throw new Error("An item with this name already exists there.")
    }

    // Native collection MOVE — also moves empty folders.
    if (webdavContext(files)) {
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
  const webdav = webdavContext(files)
  // The sdk's `listAll` would walk the entire tree from the adapter root, not
  // just the folder being bundled.
  if (webdav) return collectWebdavKeys(webdav, prefix)

  const keys: string[] = []
  for await (const item of files.listAll({ prefix })) {
    if (item.key !== prefix && !item.key.endsWith("/")) keys.push(item.key)
  }
  return keys
}

/** Every file key under a WebDAV prefix, one depth-1 PROPFIND per directory. */
async function collectWebdavKeys(
  webdav: NonNullable<ReturnType<typeof webdavContext>>,
  prefix: string
): Promise<string[]> {
  const keys: string[] = []

  const walk = async (folder: string) => {
    const { items } = await listWebdavFolder(webdav, folder)
    const subfolders: string[] = []
    for (const item of items) {
      if (item.kind === "folder") subfolders.push(item.path)
      else keys.push(item.key ?? item.path)
    }
    for (const subfolder of subfolders) await walk(subfolder)
  }

  await walk(prefix)
  return keys
}

/**
 * Cheapest round trip that proves the credentials and reachability. WebDAV
 * gets a single depth-1 PROPFIND of the root — `list({ limit: 1 })` would
 * crawl the whole tree first and time out on any real server.
 */
export async function probeConnection(files: FilesClient): Promise<void> {
  try {
    const webdav = webdavContext(files)
    if (webdav) {
      await listWebdavFolder(webdav, "")
      return
    }
    await files.list({ limit: 1 })
  } catch (error) {
    throw normalizeError(error)
  }
}
