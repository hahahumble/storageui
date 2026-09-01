import type { ConnectionRef } from "@/lib/storage/connection-ref"
import { refFromRequest, resolveFiles } from "@/lib/storage/connections-server"
import { collectZipKeys } from "@/lib/storage/file-operations"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const connectionId = url.searchParams.get("c")
  const path = url.searchParams.get("path")
  if (!connectionId || !path) {
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

  const prefix = path.endsWith("/") ? path : `${path}/`

  let keys: string[]
  try {
    keys = await collectZipKeys(files, prefix)
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Could not list folder.",
      { status: 502 }
    )
  }

  if (keys.length === 0) {
    return new Response("This folder has no files to download.", {
      status: 404,
    })
  }

  const folderName = prefix.slice(0, -1).split("/").pop() || "folder"
  const stream = files.zip(keys, { name: (key) => key.slice(prefix.length) })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(`${folderName}.zip`),
    },
  })
}

/** A header value must be ASCII, so a non-ASCII name needs RFC 5987. */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "")
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}
