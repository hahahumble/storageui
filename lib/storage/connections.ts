/**
 * Object-storage connection model.
 *
 * Credentials never reach the browser as part of the build: env-configured
 * buckets live in server-only env vars (see `connections-server.ts`) and are
 * exercised through server actions + presigned URLs. Connections the user adds
 * in the UI keep their credentials in that user's own browser (localStorage)
 * and are sent to the server per call to sign requests.
 *
 * For an `env` connection the client only ever holds the public fields below
 * (its `accessKeyId` / `secretAccessKey` are blanked); for a `local`
 * connection they are populated. The target bucket must allow CORS for the
 * browser's direct presigned GET/PUT requests.
 */

export type ConnectionProvider =
  | "s3"
  | "r2"
  | "alibaba"
  | "backblaze-b2"
  | "minio"
  | "tencent"
  | "s3-compatible"
  | "webdav"

/**
 * WebDAV auth strategy — mirrors the `webdav` client's `AuthType`, minus
 * `token`: that one needs a bearer token this app has no field for, so it
 * could only ever fail at request time. `basic` and `password` are the same
 * strategy under both names.
 */
export type WebdavAuthType = "auto" | "basic" | "digest" | "none" | "password"

/** Every accepted {@link WebdavAuthType}, for validating env input. */
export const WEBDAV_AUTH_TYPES: readonly WebdavAuthType[] = [
  "auto",
  "basic",
  "digest",
  "none",
  "password",
]

export type Connection = {
  id: string
  name: string
  provider: ConnectionProvider
  bucket: string
  region?: string
  /**
   * Custom endpoint for R2, Alibaba OSS, Backblaze B2, Tencent COS, or
   * S3-compatible services; the collection base URL for WebDAV.
   */
  endpoint?: string
  /** Path-style addressing — required by MinIO and some S3-compatible services. */
  forcePathStyle?: boolean
  /** Cloudflare account id (R2). */
  accountId?: string
  /**
   * Access key id, or the username for WebDAV basic/digest auth. Blank for
   * `env` connections on the client — credentials never leave the server.
   */
  accessKeyId: string
  /** Secret access key, or the password for WebDAV basic/digest auth. */
  secretAccessKey: string
  /** WebDAV auth strategy. Defaults to `"password"` when a username is set. */
  authType?: WebdavAuthType
  /** WebDAV root directory the virtual keys resolve under. */
  root?: string
  /** Public/CDN origin; when set, `url()` skips signing (and WebDAV's proxy). */
  publicBaseUrl?: string
  /** Disallow uploads and every other mutating operation. */
  readOnly?: boolean
  /** Where the connection came from. `env` definitions cannot be edited in the UI. */
  source: "env" | "local"
}

/** Stable id of the legacy single-bucket env connection. */
export const ENV_CONNECTION_ID = "env"
/** Prefix for indexed env connections, e.g. `env-1`, `env-2`. */
export const ENV_CONNECTION_ID_PREFIX = "env-"

export function createConnectionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
