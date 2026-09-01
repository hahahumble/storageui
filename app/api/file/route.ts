import type { ConnectionRef } from "@/lib/storage/connection-ref"
import { refFromRequest, resolveFiles } from "@/lib/storage/connections-server"
import { normalizeError } from "@/lib/storage/file-operations"

export const dynamic = "force-dynamic"

/**
 * Streams a single file through the server for adapters with no presigned
 * URL primitive (WebDAV). Auth is enforced by the global proxy.
 *
 * The query string names the connection by id only — a `local` connection's
 * credentials arrive in its path-scoped cookie, because this URL is used as an
 * `<img>`/media src and a download link and so ends up in browser history,
 * `Referer` headers and access logs.
 *
 * Supports a single `Range` request (`bytes=start-end`) so video seeking and
 * resumable downloads work; `?download=1` forces an attachment disposition.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const connectionId = url.searchParams.get("c")
  const key = url.searchParams.get("key")
  if (!connectionId || !key) {
    return new Response("Invalid request.", { status: 400 })
  }

  let ref: ConnectionRef
  try {
    ref = refFromRequest(request, connectionId)
  } catch {
    return new Response("Invalid request.", { status: 400 })
  }

  let files
  try {
    files = resolveFiles(ref)
  } catch {
    return new Response("Unknown connection.", { status: 404 })
  }

  const range = parseRangeHeader(request.headers.get("range"))
  const download = url.searchParams.get("download") === "1"

  try {
    // `head` gives the *total* size — the ranged `download` reports the
    // slice length, which is not what `Content-Range` wants.
    let total = 0
    let type = "application/octet-stream"
    try {
      const meta = await files.head(key)
      total = meta.size ?? 0
      type = meta.type || inferTypeFromKey(key)
    } catch {
      // Missing objects fail on the download below with a proper error.
    }

    if (range) {
      if (total === 0 || range.start >= total) {
        return new Response("Range not satisfiable.", {
          status: 416,
          headers: { "Content-Range": `bytes */${total}` },
        })
      }
      const end = Math.min(range.end ?? total - 1, total - 1)
      const stored = await files.download(key, {
        as: "stream",
        range: { start: range.start, end },
      })
      const headers = new Headers({
        "Accept-Ranges": "bytes",
        "Content-Type": stored.type || type,
        "Content-Range": `bytes ${range.start}-${end}/${total}`,
        "Content-Length": String(end - range.start + 1),
      })
      return new Response(stored.stream(), { status: 206, headers })
    }

    const stored = await files.download(key, { as: "stream" })
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Content-Type": stored.type || type,
    })
    if (download) {
      const name = key.split("/").pop() || "download"
      headers.set(
        "Content-Disposition",
        `attachment; filename="${name.replaceAll('"', "")}"`
      )
    }
    if (stored.size) headers.set("Content-Length", String(stored.size))
    return new Response(stored.stream(), { status: 200, headers })
  } catch (error) {
    const err = normalizeError(error)
    const isMissing = /\(NotFound\)/.test(err.message)
    return new Response(err.message, { status: isMissing ? 404 : 502 })
  }
}

/** Parse a single `bytes=start-end` range; `end` is inclusive. */
function parseRangeHeader(
  header: string | null
): { start: number; end?: number } | null {
  if (!header) return null
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const start = Number(match[1])
  if (!Number.isSafeInteger(start) || start < 0) return null
  if (match[2] === "") return { start }
  const end = Number(match[2])
  if (!Number.isSafeInteger(end) || end < start) return null
  return { start, end }
}

function inferTypeFromKey(key: string): string {
  const extension = key.slice(key.lastIndexOf(".") + 1).toLowerCase()
  const common: Record<string, string> = {
    avi: "video/x-msvideo",
    bmp: "image/bmp",
    css: "text/css",
    csv: "text/csv",
    gif: "image/gif",
    htm: "text/html",
    html: "text/html",
    ico: "image/x-icon",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    js: "text/javascript",
    json: "application/json",
    md: "text/markdown",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
    txt: "text/plain",
    webm: "video/webm",
    webp: "image/webp",
    xml: "application/xml",
    zip: "application/zip",
  }
  return common[extension] ?? "application/octet-stream"
}
