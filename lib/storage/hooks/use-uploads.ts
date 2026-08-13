import * as React from "react"

import type { UploadProgress } from "@/lib/storage/hooks/use-file-system"

export type UploadTaskStatus = "uploading" | "done" | "error"

export type UploadTask = {
  id: string
  name: string
  key: string
  status: UploadTaskStatus
  loaded: number
  total: number
  error?: string
}

/** Normalize a user-typed destination into a key prefix (no leading slash, trailing slash). */
export function normalizePrefix(input: string): string {
  const trimmed = input.trim().replace(/^\/+/, "")
  if (!trimmed) return ""
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`
}

/** A file to upload, with the path it should take relative to the destination. */
export type UploadItem = { file: File; path: string }

/**
 * Expand a drop into the actual files it contains.
 *
 * `dataTransfer.files` reports a dropped *folder* as a single entry named after
 * the folder, with a nonsense size and no readable contents — uploading that is
 * what fails. Only the entry API can see inside a directory, so directories are
 * walked, and each file keeps its path so the tree is recreated rather than
 * flattened. Empty directories carry no files and so are not created.
 *
 * The entries must be taken from the live event; `DataTransfer` goes inert as
 * soon as the handler returns, which is why this takes them already collected.
 */
export async function expandDropEntries(
  entries: FileSystemEntry[]
): Promise<UploadItem[]> {
  const items: UploadItem[] = []
  for (const entry of entries) await walkEntry(entry, "", items)
  return items
}

async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  items: UploadItem[]
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      ;(entry as FileSystemFileEntry).file(resolve, reject)
    })
    items.push({ file, path: `${prefix}${entry.name}` })
    return
  }
  if (!entry.isDirectory) return

  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const dir = `${prefix}${entry.name}/`

  // readEntries hands back one batch per call (capped at 100 in Chrome); an
  // empty batch is the only end-of-directory signal.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
    if (batch.length === 0) return
    for (const child of batch) await walkEntry(child, dir, items)
  }
}

let counter = 0
function nextId() {
  counter += 1
  return `upload-${counter}`
}

type UploadFn = (
  key: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void
) => Promise<void>

/**
 * Manages a queue of browser-direct uploads with per-file progress. Surfaces
 * tasks for a floating progress panel; calls `onBatchComplete` after a batch
 * finishes with at least one success (so the caller can refresh the listing).
 */
export function useUploads({
  uploadFile,
  onBatchComplete,
}: {
  uploadFile: UploadFn
  onBatchComplete?: () => void
}) {
  const [tasks, setTasks] = React.useState<UploadTask[]>([])

  const uploadFileRef = React.useRef(uploadFile)
  const onBatchCompleteRef = React.useRef(onBatchComplete)

  React.useEffect(() => {
    uploadFileRef.current = uploadFile
  }, [uploadFile])

  React.useEffect(() => {
    onBatchCompleteRef.current = onBatchComplete
  }, [onBatchComplete])

  const enqueue = React.useCallback((items: UploadItem[], prefix: string) => {
    if (items.length === 0) return
    const dest = normalizePrefix(prefix)
    const entries = items.map(({ file, path }) => ({
      id: nextId(),
      file,
      path,
      key: `${dest}${path}`,
    }))

    setTasks((prev) => [
      ...prev,
      ...entries.map((e) => ({
        id: e.id,
        // The path, not the bare filename: in a folder upload it is the only
        // thing that distinguishes one `slide1.png` from another.
        name: e.path,
        key: e.key,
        status: "uploading" as UploadTaskStatus,
        loaded: 0,
        total: e.file.size,
      })),
    ])

    void (async () => {
      let successes = 0
      for (const e of entries) {
        try {
          await uploadFileRef.current(e.key, e.file, ({ loaded, total }) => {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === e.id ? { ...t, loaded, total: total ?? t.total } : t
              )
            )
          })
          successes += 1
          setTasks((prev) =>
            prev.map((t) =>
              t.id === e.id ? { ...t, status: "done", loaded: t.total } : t
            )
          )
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          setTasks((prev) =>
            prev.map((t) =>
              t.id === e.id ? { ...t, status: "error", error: message } : t
            )
          )
        }
      }
      if (successes > 0) onBatchCompleteRef.current?.()
    })()
  }, [])

  const dismiss = React.useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  /** Remove finished tasks; if any are still uploading they stay. */
  const clearFinished = React.useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status === "uploading"))
  }, [])

  const activeCount = tasks.filter((t) => t.status === "uploading").length

  return { tasks, enqueue, dismiss, clearFinished, activeCount }
}
