"use client"

import * as React from "react"

import {
  encodeRefHeader,
  PROXY_COOKIE_PREFIX,
  REF_HEADER,
  toConnectionRef,
  type ConnectionRef,
} from "@/lib/storage/connection-ref"
import type { Connection } from "@/lib/storage/connections"
import * as clientFileOps from "@/lib/storage/file-operations"
import type { EntryRef, SignedUpload } from "@/lib/storage/files-client"
import { thumbnailHandleFor } from "@/lib/storage/thumbnails"
import { createUrlBatcher } from "@/lib/storage/url-batcher"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import type {
  FileSystemFileItem,
  FileSystemItem,
  FileSystemLoadChildrenResult,
} from "@/components/explorer/types"
import {
  createFolderAction,
  deleteEntryAction,
  listFolderAction,
  moveEntryAction,
  renameEntryAction,
  signFileUrlAction,
  signFileUrlsAction,
  signUploadUrlAction,
} from "@/app/actions/files"

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

const PROXY_PATH = `${BASE_PATH}/api/file`
const ZIP_PATH = `${BASE_PATH}/api/zip`

/**
 * Hand a `local` connection's credentials to a GET route without putting them
 * in the URL, which would land in history, the download list, `Referer` and
 * access logs. Scoped to that one route's path.
 */
function writeConnectionCookie(connection: Connection, path: string) {
  if (connection.source !== "local") return

  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie =
    `${PROXY_COOKIE_PREFIX}${encodeURIComponent(connection.id)}=` +
    `${encodeURIComponent(JSON.stringify(connection))}` +
    `; Path=${path}; SameSite=Strict${secure}`
}

/** Server-proxied file URL for adapters with no presigned URL primitive. */
function webdavProxyUrl(
  connection: Connection | null,
  key: string,
  download = false
): string {
  if (!connection) return ""

  writeConnectionCookie(connection, PROXY_PATH)

  const params = new URLSearchParams({ c: connection.id, key })
  if (download) params.set("download", "1")
  return `${PROXY_PATH}?${params.toString()}`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function toEntryRef(item: FileSystemItem): EntryRef {
  return {
    kind: item.kind,
    path: item.path,
    key: item.kind === "file" ? item.key : undefined,
  }
}

export type UploadProgress = { loaded: number; total?: number }

export type S3FileSystem = {
  items: FileSystemItem[]
  loadChildren: (args: {
    path: string
    cursor: string | null
  }) => Promise<FileSystemLoadChildrenResult>
  getFileUrl: (file: FileSystemFileItem) => Promise<string>
  /** Upload a single file to `key`, reporting byte progress when available. */
  uploadFile: (
    key: string,
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ) => Promise<void>
  /** Create an object-store folder marker at a path ending in `/`. */
  createFolder: (path: string) => Promise<void>
  /** Download a file directly or bundle a folder's contents into a ZIP. */
  downloadEntry: (item: FileSystemItem) => Promise<void>
  /** Delete a file or recursively delete every object under a folder. */
  deleteEntry: (item: FileSystemItem) => Promise<void>
  /** Rename a file or recursively move every object under a folder. */
  renameEntry: (item: FileSystemItem, name: string) => Promise<void>
  /** Move a file or folder into another folder (`""` is the bucket root). */
  moveEntry: (item: FileSystemItem, destinationFolder: string) => Promise<void>
  /** Re-fetch the bucket root listing (e.g. after an upload). */
  refresh: () => void
  /** `null` when the route cannot serve this bucket; see `thumbnailHandleFor`. */
  thumbnailHandle: string | null
  isLoading: boolean
  error: string | null
}

function saveDownload(url: string, name: string, revoke = false) {
  const anchor = document.createElement("a")

  anchor.href = url
  anchor.download = name
  anchor.rel = "noopener"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  if (revoke) setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Send a body with byte progress. `fetch` has no upload-progress event at all,
 * which is why every upload path here goes through XHR.
 */
function sendWithProgress({
  method,
  url,
  body,
  headers,
  onProgress,
  describeFailure,
}: {
  method: string
  url: string
  body: XMLHttpRequestBodyInit
  headers?: Record<string, string>
  onProgress?: (progress: UploadProgress) => void
  describeFailure: (status: number, responseText: string) => string
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.onprogress = (event) => {
      onProgress?.({
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : undefined,
      })
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(describeFailure(xhr.status, xhr.responseText)))
    xhr.onerror = () => reject(new Error("Upload failed."))

    xhr.open(method, url)
    for (const [name, value] of Object.entries(headers ?? {})) {
      xhr.setRequestHeader(name, value)
    }
    xhr.send(body)
  })
}

/** Direct browser upload to a presigned URL, with byte progress. */
function uploadToSignedUrl(
  signed: SignedUpload,
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<void> {
  // The provider answers with an XML error document, which is no use in the
  // progress panel — the status code is the readable part.
  const describeFailure = (status: number) => `Upload failed (${status}).`

  if (signed.method === "PUT") {
    const headers = { ...signed.headers }
    const hasContentType = Object.keys(headers).some(
      (name) => name.toLowerCase() === "content-type"
    )
    if (!hasContentType && file.type) headers["Content-Type"] = file.type

    return sendWithProgress({
      method: "PUT",
      url: signed.url,
      body: file,
      headers,
      onProgress,
      describeFailure,
    })
  }

  const form = new FormData()
  for (const [name, value] of Object.entries(signed.fields)) {
    form.append(name, value)
  }
  form.append("file", file)

  return sendWithProgress({
    method: "POST",
    url: signed.url,
    body: form,
    onProgress,
    describeFailure,
  })
}

/**
 * The transport for a connection's storage operations. Two implementations back
 * it: server actions (the default), and direct in-browser `files-sdk` calls for
 * local connections when the user enables direct client requests.
 */
type FileOps = {
  listFolder: (
    prefix: string,
    cursor: string | null
  ) => Promise<FileSystemLoadChildrenResult>
  signFileUrl: (key: string) => Promise<string>
  signFileUrls: (keys: string[]) => Promise<Record<string, string>>
  signUploadUrl: (key: string, contentType?: string) => Promise<SignedUpload>
  /** Direct server/browser upload — used where presigning isn't possible. */
  uploadFile: (
    key: string,
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ) => Promise<void>
  createFolder: (path: string) => Promise<void>
  deleteEntry: (item: FileSystemItem) => Promise<void>
  renameEntry: (item: FileSystemItem, name: string) => Promise<void>
  moveEntry: (item: FileSystemItem, destinationFolder: string) => Promise<void>
  downloadFolder: (item: FileSystemItem) => Promise<void>
}

/** Route operations through the Next.js server actions (the default). */
function serverOps(ref: ConnectionRef): FileOps {
  return {
    listFolder: (prefix, cursor) => listFolderAction(ref, prefix, cursor),
    signFileUrl: (key) => signFileUrlAction(ref, key),
    signFileUrls: (keys) => signFileUrlsAction(ref, keys),
    signUploadUrl: (key, contentType) =>
      signUploadUrlAction(ref, key, contentType),
    uploadFile: async (key, file, onProgress) => {
      // The raw file is the whole body — no multipart wrapper — so the route
      // can pipe it upstream as it arrives instead of collecting it first.
      // That is what makes the reported progress the real one.
      await sendWithProgress({
        method: "POST",
        url: `${BASE_PATH}/api/upload?${new URLSearchParams({ key })}`,
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          [REF_HEADER]: encodeRefHeader(ref),
        },
        onProgress,
        // This route answers with a plain-text reason worth showing.
        describeFailure: (status, responseText) =>
          responseText || `Could not upload file (${status}).`,
      })
    },
    createFolder: (path) => createFolderAction(ref, path),
    deleteEntry: (item) => deleteEntryAction(ref, toEntryRef(item)),
    renameEntry: (item, name) => renameEntryAction(ref, toEntryRef(item), name),
    moveEntry: (item, destinationFolder) =>
      moveEntryAction(ref, toEntryRef(item), destinationFolder),
    // A plain download, not a fetch: fetching buffers the whole archive in
    // memory and shows the user nothing until the last byte arrives.
    downloadFolder: async (item) => {
      const connectionId = ref.source === "env" ? ref.id : ref.connection.id
      if (ref.source === "local") {
        writeConnectionCookie(ref.connection, ZIP_PATH)
      }

      const folderName =
        item.name ?? item.path.replace(/\/$/, "").split("/").pop() ?? "folder"
      const params = new URLSearchParams({ c: connectionId, path: item.path })
      saveDownload(`${ZIP_PATH}?${params.toString()}`, `${folderName}.zip`)
    },
  }
}

/**
 * Route operations directly from the browser. Lazily imports the client-side
 * `files-sdk` builder so the AWS SDK stays out of the default bundle, then runs
 * the shared operations against a `FilesClient` built once for this connection.
 */
async function makeClientOps(connection: Connection): Promise<FileOps> {
  const { buildFilesForConnectionClient } =
    await import("@/lib/storage/connections-client")
  const files = buildFilesForConnectionClient(connection)

  const assertWritable = () => {
    if (connection.readOnly) throw new Error("This bucket is read-only.")
  }

  return {
    listFolder: (prefix, cursor) =>
      clientFileOps.listFolder(files, prefix, cursor),
    signFileUrl: (key) => clientFileOps.signFileUrl(files, key),
    signFileUrls: (keys) => clientFileOps.signFileUrls(files, keys),
    signUploadUrl: async (key, contentType) => {
      assertWritable()
      return clientFileOps.signUploadUrl(files, key, contentType)
    },
    uploadFile: async (key, file, onProgress) => {
      assertWritable()
      await files.upload(key, file, {
        contentType: file.type || undefined,
        onProgress,
      })
    },
    createFolder: async (path) => {
      assertWritable()
      return clientFileOps.createFolder(files, path)
    },
    deleteEntry: async (item) => {
      assertWritable()
      return clientFileOps.deleteEntry(files, toEntryRef(item))
    },
    renameEntry: async (item, name) => {
      assertWritable()
      return clientFileOps.renameEntry(files, toEntryRef(item), name)
    },
    moveEntry: async (item, destinationFolder) => {
      assertWritable()
      return clientFileOps.moveEntry(files, toEntryRef(item), destinationFolder)
    },
    downloadFolder: async (item) => {
      const prefix = item.path.endsWith("/") ? item.path : `${item.path}/`
      const keys = await clientFileOps.collectZipKeys(files, prefix)
      if (keys.length === 0) {
        throw new Error("This folder has no files to download.")
      }

      const stream = files.zip(keys, {
        name: (key: string) => key.slice(prefix.length),
      })
      const blob = await new Response(stream).blob()
      const folderName =
        item.name ?? item.path.replace(/\/$/, "").split("/").pop() ?? "folder"
      saveDownload(URL.createObjectURL(blob), `${folderName}.zip`, true)
    },
  }
}

/** Adapts a connection's `files-sdk` client (server or direct) to FileSystem props. */
export function useS3FileSystem(connection: Connection | null): S3FileSystem {
  const [items, setItems] = React.useState<FileSystemItem[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [loadedConnection, setLoadedConnection] =
    React.useState<Connection | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const directClientRequests = usePreferencesStore(
    (state) => state.directClientRequests
  )
  // Only local connections can run in the browser — env credentials are blanked
  // client-side, so those always go through the server. WebDAV is excluded: a
  // cross-origin PROPFIND/MKCOL carrying `Authorization` needs CORS that no
  // stock Nextcloud/ownCloud/NAS grants, and digest auth cannot work from a
  // browser at all.
  const direct =
    directClientRequests &&
    connection?.source === "local" &&
    connection.provider !== "webdav"

  const ref = React.useMemo<ConnectionRef | null>(
    () => (connection ? toConnectionRef(connection) : null),
    [connection]
  )

  // Resolve the transport once per (connection, direct) pair. In direct mode the
  // client `FilesClient` is built a single time behind this memoized promise.
  const opsPromise = React.useMemo<Promise<FileOps | null>>(() => {
    if (!ref || !connection) return Promise.resolve(null)
    return direct ? makeClientOps(connection) : Promise.resolve(serverOps(ref))
  }, [ref, connection, direct])

  // Load the bucket root whenever the active connection or transport changes.
  React.useEffect(() => {
    if (!ref) {
      setItems([])
      setLoadedConnection(null)
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    opsPromise
      .then((ops) => (ops ? ops.listFolder("", null) : null))
      .then((result) => {
        if (!cancelled && result) setItems(result.items)
      })
      .catch((err) => {
        if (!cancelled) {
          setItems([])
          setError(errorMessage(err))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadedConnection(connection)
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [ref, connection, opsPromise])

  // Re-fetch the root listing on demand (after uploads/deletes). Runs silently
  // — it deliberately doesn't toggle `isLoading`, so re-listing after a
  // mutation swaps the items in without flashing the full-content loading
  // state. The FileSystem's own `reloadToken` handles the visible folder.
  const refresh = React.useCallback(() => {
    if (!ref) return
    opsPromise
      .then((ops) => (ops ? ops.listFolder("", null) : null))
      .then((result) => {
        if (result) setItems(result.items)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [ref, opsPromise])

  const loadChildren = React.useCallback(
    async ({ path, cursor }: { path: string; cursor: string | null }) => {
      const ops = await opsPromise
      if (!ops) return { items: [], nextCursor: null }
      return ops.listFolder(path, cursor)
    },
    [opsPromise]
  )

  const urlBatcher = React.useMemo(
    () =>
      createUrlBatcher(async (keys) => {
        const ops = await opsPromise
        if (!ops) return {}
        return ops.signFileUrls(keys)
      }),
    [opsPromise]
  )

  const getFileUrl = React.useCallback(
    (file: FileSystemFileItem): Promise<string> => {
      // WebDAV can't presign: without a publicBaseUrl the browser has no
      // authenticated way to fetch the object, so route it through the server.
      if (connection?.provider === "webdav" && !connection.publicBaseUrl) {
        return Promise.resolve(
          webdavProxyUrl(connection, file.key ?? file.path)
        )
      }
      return urlBatcher.get(file.key ?? file.path)
    },
    [connection, urlBatcher]
  )

  const thumbnailHandle = React.useMemo(
    () => thumbnailHandleFor(connection),
    [connection]
  )

  const uploadFile = React.useCallback(
    async (
      key: string,
      file: File,
      onProgress?: (progress: UploadProgress) => void
    ) => {
      const ops = await opsPromise
      if (!ops) throw new Error("No active connection")
      try {
        // WebDAV has no presigned upload — stream it through the server (or,
        // in direct mode, straight from the browser's own client).
        if (connection?.provider === "webdav") {
          await ops.uploadFile(key, file, onProgress)
          return
        }
        const signed = await ops.signUploadUrl(key, file.type || undefined)
        await uploadToSignedUrl(signed, file, onProgress)
      } catch (err) {
        throw new Error(errorMessage(err))
      }
    },
    [connection, opsPromise]
  )

  const createFolder = React.useCallback(
    async (path: string) => {
      const ops = await opsPromise
      if (!ops) throw new Error("No active connection")
      try {
        await ops.createFolder(path)
      } catch (err) {
        throw new Error(errorMessage(err))
      }
    },
    [opsPromise]
  )

  const downloadEntry = React.useCallback(
    async (item: FileSystemItem) => {
      const ops = await opsPromise
      if (!ops) throw new Error("No active connection")

      try {
        if (item.kind === "file") {
          const key = item.key ?? item.path
          const url =
            connection?.provider === "webdav" && !connection.publicBaseUrl
              ? webdavProxyUrl(connection, key, true)
              : await ops.signFileUrl(key)
          const name = item.name ?? key.split("/").pop() ?? "download"
          saveDownload(url, name)
          return
        }

        await ops.downloadFolder(item)
      } catch (err) {
        throw new Error(errorMessage(err))
      }
    },
    [connection, opsPromise, ref]
  )

  const deleteEntry = React.useCallback(
    async (item: FileSystemItem) => {
      const ops = await opsPromise
      if (!ops) throw new Error("No active connection")
      try {
        await ops.deleteEntry(item)
      } catch (err) {
        throw new Error(errorMessage(err))
      }
    },
    [opsPromise]
  )

  const renameEntry = React.useCallback(
    async (item: FileSystemItem, name: string) => {
      const ops = await opsPromise
      if (!ops) throw new Error("No active connection")
      try {
        await ops.renameEntry(item, name)
      } catch (err) {
        throw new Error(errorMessage(err))
      }
    },
    [opsPromise]
  )

  const moveEntry = React.useCallback(
    async (item: FileSystemItem, destinationFolder: string) => {
      const ops = await opsPromise
      if (!ops) throw new Error("No active connection")
      try {
        await ops.moveEntry(item, destinationFolder)
      } catch (err) {
        throw new Error(errorMessage(err))
      }
    },
    [opsPromise]
  )

  return {
    items,
    loadChildren,
    getFileUrl,
    uploadFile,
    createFolder,
    downloadEntry,
    deleteEntry,
    renameEntry,
    moveEntry,
    refresh,
    thumbnailHandle,
    isLoading: Boolean(
      connection && (isLoading || loadedConnection !== connection)
    ),
    error,
  }
}
