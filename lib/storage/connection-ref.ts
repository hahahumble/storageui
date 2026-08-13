import type { Connection } from "@/lib/storage/connections"

/**
 * What the browser sends to a server action to identify the bucket to act on,
 * without exposing env credentials to the client.
 *
 * - `env`  — the connection is configured from server-only env vars; the
 *   browser only knows its id and the server resolves the real credentials.
 * - `local` — a connection the user added in the UI; its credentials live in
 *   the user's own browser (localStorage) and are sent with each call so the
 *   server can sign on their behalf. They are never baked into the public
 *   bundle.
 */
export type ConnectionRef =
  { source: "env"; id: string } | { source: "local"; connection: Connection }

/**
 * Cookie name prefix carrying a `local` connection to the server file proxy.
 * A GET URL is the wrong place for credentials, so `/api/file` reads them from
 * here and takes only the connection id in the query string.
 */
export const PROXY_COOKIE_PREFIX = "su_conn_"

/**
 * Header carrying the connection to `/api/upload`. A header, not the URL: the
 * ref holds a local connection's credentials. Base64 keeps a connection name
 * with non-ASCII characters header-safe.
 */
export const REF_HEADER = "x-storage-ref"

export function encodeRefHeader(ref: ConnectionRef): string {
  const bytes = new TextEncoder().encode(JSON.stringify(ref))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function toConnectionRef(connection: Connection): ConnectionRef {
  return connection.source === "env"
    ? { source: "env", id: connection.id }
    : { source: "local", connection }
}
