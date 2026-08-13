import { Readable } from "node:stream"
import type { ReadableStream as NodeReadableStream } from "node:stream/web"

import { isRequestAuthorized } from "@/lib/auth/core"
import { REF_HEADER, type ConnectionRef } from "@/lib/storage/connection-ref"
import {
  assertConnectionWritable,
  connectionReissuesRequests,
  resolveFiles,
} from "@/lib/storage/connections-server"
import {
  normalizeError,
  webdavUploadTarget,
} from "@/lib/storage/file-operations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Server-side upload for adapters with no presigned-upload primitive (WebDAV).
 *
 * The body is the raw file and nothing else, so it can be piped straight
 * upstream instead of buffered: the browser's upload progress is then gated by
 * the real upstream speed rather than by how fast this server can swallow the
 * file. The connection rides a header (never the URL) and resolves to a
 * credentialed client server-side.
 *
 * This route checks the session itself instead of leaning on the global proxy,
 * which cannot run here without capping the body at 10MB — see
 * `isRequestAuthorized`.
 */
export async function POST(request: Request) {
  if (!(await isRequestAuthorized(request))) {
    return new Response("Unauthorized.", { status: 401 })
  }

  const key = new URL(request.url).searchParams.get("key")
  const refHeader = request.headers.get(REF_HEADER)
  if (!key || !refHeader) {
    return new Response("Invalid request.", { status: 400 })
  }

  let ref: ConnectionRef
  try {
    ref = JSON.parse(
      Buffer.from(refHeader, "base64").toString("utf8")
    ) as ConnectionRef
  } catch {
    return new Response("Invalid request.", { status: 400 })
  }

  let files
  try {
    files = resolveFiles(ref)
  } catch (error) {
    return new Response(normalizeError(error).message, { status: 404 })
  }

  try {
    // The streaming path below bypasses the sdk, and with it the sdk's own
    // read-only gate, so the policy has to be enforced here.
    assertConnectionWritable(ref)
  } catch (error) {
    return new Response(normalizeError(error).message, { status: 403 })
  }

  const contentType =
    request.headers.get("content-type") || "application/octet-stream"
  const contentLength = request.headers.get("content-length")

  try {
    // A zero-byte file arrives with no body stream, and a connection whose
    // auth re-issues the request cannot replay a consumed one — both take the
    // buffered path, where there is nothing to stream anyway.
    const target = webdavUploadTarget(files, key)
    if (
      !target?.client.customRequest ||
      !request.body ||
      connectionReissuesRequests(ref)
    ) {
      const body = new Uint8Array(await request.arrayBuffer())
      await files.upload(key, body, { contentType })
      return new Response(null, { status: 200 })
    }

    if (target.parentRemotePath && target.client.createDirectory) {
      try {
        await target.client.createDirectory(target.parentRemotePath, {
          recursive: true,
        })
      } catch {
        // Already there, or the server rejects MKCOL on an existing
        // collection. The PUT below reports it either way.
      }
    }

    await target.client.customRequest(target.remotePath, {
      method: "PUT",
      data: Readable.fromWeb(request.body as NodeReadableStream),
      headers: {
        "Content-Type": contentType,
        // Without it the upstream request falls back to chunked encoding,
        // which some WebDAV servers refuse.
        ...(contentLength ? { "Content-Length": contentLength } : {}),
      },
    })
  } catch (error) {
    // Logged as well as returned: when the upload fails partway the browser is
    // usually still sending, and a response that arrives mid-upload may reach
    // it as a bare connection error with no message attached.
    const message = normalizeError(error).message
    console.error(`Upload of ${key} failed: ${message}`)
    return new Response(message, { status: 502 })
  }

  return new Response(null, { status: 200 })
}
