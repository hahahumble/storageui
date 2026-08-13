import type { ConnectionRef } from "@/lib/storage/connection-ref"
import { resolveFiles } from "@/lib/storage/connections-server"
import { normalizeError } from "@/lib/storage/file-operations"

export const dynamic = "force-dynamic"

/**
 * Server-side upload for adapters with no presigned-upload primitive (WebDAV).
 * Auth is enforced by the global proxy; the connection ref rides in the form
 * body (never the URL) and resolves to a credentialed client server-side.
 */
export async function POST(request: Request) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return new Response("Invalid request.", { status: 400 })
  }

  const refRaw = formData.get("ref")
  const key = formData.get("key")
  const file = formData.get("file")
  if (
    typeof refRaw !== "string" ||
    typeof key !== "string" ||
    !(file instanceof File)
  ) {
    return new Response("Invalid request.", { status: 400 })
  }

  let ref: ConnectionRef
  try {
    ref = JSON.parse(refRaw) as ConnectionRef
  } catch {
    return new Response("Invalid request.", { status: 400 })
  }

  let files
  try {
    files = resolveFiles(ref)
  } catch {
    return new Response("Unknown connection.", { status: 404 })
  }

  try {
    await files.upload(key, file, {
      contentType: file.type || undefined,
    })
  } catch (error) {
    return new Response(normalizeError(error).message, { status: 502 })
  }

  return new Response(null, { status: 200 })
}
