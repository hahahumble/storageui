import "server-only"

import { createFiles as createFilesSdk } from "files-sdk"
import { alibaba } from "files-sdk/alibaba"
import { backblazeB2 } from "files-sdk/backblaze-b2"
import { minio } from "files-sdk/minio"
import { r2 } from "files-sdk/r2"
import { s3 } from "files-sdk/s3"
import { tencent } from "files-sdk/tencent"
import { webdav } from "files-sdk/webdav"
import { zip } from "files-sdk/zip"

import { readCookie } from "@/lib/auth/core"
import {
  PROXY_COOKIE_PREFIX,
  type ConnectionRef,
} from "@/lib/storage/connection-ref"
import {
  ENV_CONNECTION_ID,
  ENV_CONNECTION_ID_PREFIX,
  WEBDAV_AUTH_TYPES,
  type Connection,
  type ConnectionProvider,
  type WebdavAuthType,
} from "@/lib/storage/connections"
import type { FilesClient } from "@/lib/storage/files-client"

export type { FilesClient }

/** Raw, provider-neutral env values for one bucket slot. */
type RawEnvSlot = {
  provider?: string
  name?: string
  bucket?: string
  region?: string
  endpoint?: string
  forcePathStyle?: string
  accountId?: string
  accessKeyId?: string
  secretAccessKey?: string
  /** WebDAV basic/digest credentials (aliases for accessKeyId/secretAccessKey). */
  username?: string
  password?: string
  authType?: string
  root?: string
  publicBaseUrl?: string
  readOnly?: string
}

// Highest `STORAGE_<N>_*` index scanned. These are server-only env vars (no
// `NEXT_PUBLIC_` prefix), read at runtime — unlike client-inlined vars they can
// be looked up by a computed key, so there's no need to spell out each slot.
const MAX_ENV_BUCKETS = 50

/** Read one numbered `STORAGE_<n>_*` slot. */
function numberedEnvSlot(n: number): RawEnvSlot {
  const prefix = `STORAGE_${n}_`
  return {
    provider: process.env[`${prefix}PROVIDER`],
    name: process.env[`${prefix}NAME`],
    bucket: process.env[`${prefix}BUCKET`],
    region: process.env[`${prefix}REGION`],
    endpoint: process.env[`${prefix}ENDPOINT`],
    forcePathStyle: process.env[`${prefix}FORCE_PATH_STYLE`],
    accountId: process.env[`${prefix}ACCOUNT_ID`],
    accessKeyId: process.env[`${prefix}ACCESS_KEY_ID`],
    secretAccessKey: process.env[`${prefix}SECRET_ACCESS_KEY`],
    username: process.env[`${prefix}USERNAME`],
    password: process.env[`${prefix}PASSWORD`],
    authType: process.env[`${prefix}AUTH_TYPE`],
    root: process.env[`${prefix}ROOT`],
    publicBaseUrl: process.env[`${prefix}PUBLIC_BASE_URL`],
    readOnly: process.env[`${prefix}READ_ONLY`],
  }
}

// Backward-compatible single-bucket slot (the original `S3_*` scheme).
const LEGACY_ENV_SLOT: RawEnvSlot = {
  provider: process.env.S3_PROVIDER,
  name: process.env.S3_NAME,
  bucket: process.env.S3_BUCKET,
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE,
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  publicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
  readOnly: process.env.S3_READ_ONLY,
}

/**
 * An unrecognized value would otherwise reach the adapter and throw on every
 * single operation, while the bucket still showed up in the sidebar.
 */
function parseAuthType(value: string | undefined): WebdavAuthType | undefined {
  if (!value) return undefined
  if ((WEBDAV_AUTH_TYPES as readonly string[]).includes(value)) {
    return value as WebdavAuthType
  }
  console.warn(
    `Ignoring unknown WebDAV auth type ${JSON.stringify(value)}. Expected one of: ${WEBDAV_AUTH_TYPES.join(", ")}.`
  )
  return undefined
}

function slotToConnection(raw: RawEnvSlot, id: string): Connection | null {
  const provider = (raw.provider as ConnectionProvider | undefined) ?? "s3"

  if (provider === "webdav") {
    if (!raw.endpoint) return null
    return {
      id,
      name: raw.name || raw.endpoint,
      provider,
      bucket: raw.bucket ?? "",
      endpoint: raw.endpoint,
      accessKeyId: raw.username ?? raw.accessKeyId ?? "",
      secretAccessKey: raw.password ?? raw.secretAccessKey ?? "",
      authType: parseAuthType(raw.authType),
      root: raw.root || undefined,
      publicBaseUrl: raw.publicBaseUrl || undefined,
      readOnly: raw.readOnly === "true",
      source: "env",
    }
  }

  if (
    !raw.bucket ||
    !raw.accessKeyId ||
    !raw.secretAccessKey ||
    ((provider === "alibaba" ||
      provider === "backblaze-b2" ||
      provider === "tencent") &&
      !raw.region) ||
    (provider === "minio" && !raw.endpoint)
  )
    return null

  return {
    id,
    name: raw.name || raw.bucket,
    provider,
    bucket: raw.bucket,
    region: raw.region || undefined,
    endpoint: raw.endpoint || undefined,
    // MinIO is path-style by default; other providers default to off.
    forcePathStyle:
      provider === "minio"
        ? raw.forcePathStyle !== "false"
        : raw.forcePathStyle === "true",
    accountId: raw.accountId || undefined,
    accessKeyId: raw.accessKeyId,
    secretAccessKey: raw.secretAccessKey,
    publicBaseUrl: raw.publicBaseUrl || undefined,
    readOnly: raw.readOnly === "true",
    source: "env",
  }
}

/** Every env-configured connection, with real credentials. Server-only. */
function loadEnvConnections(): Connection[] {
  const connections: Connection[] = []

  const legacy = slotToConnection(LEGACY_ENV_SLOT, ENV_CONNECTION_ID)
  if (legacy) connections.push(legacy)

  for (let n = 1; n <= MAX_ENV_BUCKETS; n++) {
    const connection = slotToConnection(
      numberedEnvSlot(n),
      `${ENV_CONNECTION_ID_PREFIX}${n}`
    )
    if (connection) connections.push(connection)
  }

  return connections
}

function getEnvConnection(id: string): Connection | null {
  return loadEnvConnections().find((connection) => connection.id === id) ?? null
}

/** Strip credentials so the env connection list is safe to send to the browser. */
export function listPublicEnvConnections(): Connection[] {
  return loadEnvConnections().map((connection) => ({
    ...connection,
    accessKeyId: "",
    secretAccessKey: "",
  }))
}

function buildFiles(connection: Connection): FilesClient {
  const readonly = connection.readOnly

  if (connection.provider === "webdav") {
    if (!connection.endpoint) {
      throw new Error("WebDAV requires a base URL.")
    }

    return createFilesSdk({
      adapter: webdav({
        baseUrl: connection.endpoint,
        username: connection.accessKeyId || undefined,
        password: connection.secretAccessKey || undefined,
        authType: connection.authType,
        root: connection.root || undefined,
        publicBaseUrl: connection.publicBaseUrl || undefined,
      }),
      readonly,
      plugins: [zip()],
    })
  }

  if (connection.provider === "r2") {
    return createFilesSdk({
      adapter: r2({
        bucket: connection.bucket,
        accountId: connection.accountId,
        accessKeyId: connection.accessKeyId,
        secretAccessKey: connection.secretAccessKey,
        publicBaseUrl: connection.publicBaseUrl,
      }),
      readonly,
      plugins: [zip()],
    })
  }

  if (connection.provider === "alibaba") {
    if (!connection.region) {
      throw new Error("Alibaba Cloud OSS requires a region.")
    }

    return createFilesSdk({
      adapter: alibaba({
        bucket: connection.bucket,
        region: connection.region,
        endpoint: connection.endpoint,
        forcePathStyle: connection.forcePathStyle,
        accessKeyId: connection.accessKeyId,
        secretAccessKey: connection.secretAccessKey,
        publicBaseUrl: connection.publicBaseUrl,
      }),
      readonly,
      plugins: [zip()],
    })
  }

  if (connection.provider === "backblaze-b2") {
    if (!connection.region) {
      throw new Error("Backblaze B2 requires a cluster region.")
    }

    return createFilesSdk({
      adapter: backblazeB2({
        bucket: connection.bucket,
        region: connection.region,
        endpoint: connection.endpoint,
        forcePathStyle: connection.forcePathStyle,
        accessKeyId: connection.accessKeyId,
        secretAccessKey: connection.secretAccessKey,
        publicBaseUrl: connection.publicBaseUrl,
      }),
      readonly,
      plugins: [zip()],
    })
  }

  if (connection.provider === "minio") {
    if (!connection.endpoint) {
      throw new Error("MinIO requires an endpoint URL.")
    }

    return createFilesSdk({
      adapter: minio({
        bucket: connection.bucket,
        endpoint: connection.endpoint,
        region: connection.region,
        forcePathStyle: connection.forcePathStyle,
        accessKeyId: connection.accessKeyId,
        secretAccessKey: connection.secretAccessKey,
        publicBaseUrl: connection.publicBaseUrl,
      }),
      readonly,
      plugins: [zip()],
    })
  }

  if (connection.provider === "tencent") {
    if (!connection.region) {
      throw new Error("Tencent Cloud COS requires a region.")
    }

    return createFilesSdk({
      adapter: tencent({
        bucket: connection.bucket,
        region: connection.region,
        endpoint: connection.endpoint,
        forcePathStyle: connection.forcePathStyle,
        accessKeyId: connection.accessKeyId,
        secretAccessKey: connection.secretAccessKey,
        publicBaseUrl: connection.publicBaseUrl,
      }),
      readonly,
      plugins: [zip()],
    })
  }

  // s3 + s3-compatible. AWS SDK requires a region even with a custom endpoint;
  // "auto" is the conventional value for S3-compatible services.
  return createFilesSdk({
    adapter: s3({
      bucket: connection.bucket,
      region: connection.region || "auto",
      endpoint: connection.endpoint || undefined,
      forcePathStyle: connection.forcePathStyle,
      credentials: {
        accessKeyId: connection.accessKeyId,
        secretAccessKey: connection.secretAccessKey,
      },
      publicBaseUrl: connection.publicBaseUrl || undefined,
    }),
    readonly,
    plugins: [zip()],
  })
}

/**
 * A `local` ref names whatever endpoint the caller chose, so every server-side
 * fetch on its behalf is a request the caller aimed — pointed at the cloud
 * metadata service or an admin panel on the deployment's own network, that is
 * an SSRF. Login is optional in this app, so the check cannot lean on auth.
 * Env-configured connections are the operator's own and are never checked.
 *
 * Deployments that legitimately browse a LAN NAS or a sibling container set
 * `ALLOW_PRIVATE_ENDPOINTS=true`; local development is exempt.
 */
const ALLOW_PRIVATE_ENDPOINTS =
  process.env.ALLOW_PRIVATE_ENDPOINTS === "true" ||
  process.env.NODE_ENV !== "production"

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true
  }

  const ipv4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(
    host
  )
  if (ipv4) {
    const first = Number(ipv4[1])
    const second = Number(ipv4[2])
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127)
    )
  }

  // ::, ::1, fc00::/7 (unique local), fe80::/10 (link-local).
  return (
    host === "::" ||
    host === "::1" ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe[89ab][0-9a-f]:/.test(host)
  )
}

function assertEndpointAllowed(value: string | undefined, label: string): void {
  if (!value) return

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} is not a valid URL.`)
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must use http or https.`)
  }
  if (!ALLOW_PRIVATE_ENDPOINTS && isPrivateHostname(url.hostname)) {
    throw new Error(
      `${label} points at a private address. Set ALLOW_PRIVATE_ENDPOINTS=true on the server to allow it.`
    )
  }
}

/**
 * Resolve a {@link ConnectionRef} from the browser to a credentialed `Files`
 * client. `env` refs are looked up in server-only env (the client only sent an
 * id); `local` refs carry the user's own credentials.
 */
function resolveConnection(ref: ConnectionRef): Connection {
  if (ref.source === "env") {
    const connection = getEnvConnection(ref.id)
    if (!connection) {
      throw new Error("Unknown connection.")
    }
    return connection
  }

  assertEndpointAllowed(ref.connection.endpoint, "Endpoint")
  assertEndpointAllowed(ref.connection.publicBaseUrl, "Public base URL")
  return ref.connection
}

export function resolveFiles(ref: ConnectionRef): FilesClient {
  return buildFiles(resolveConnection(ref))
}

/**
 * The connection a GET route acts on, named by id in the query string. A
 * `local` one is read from its path-scoped cookie; never from the query — that
 * is what keeps credentials out of URLs and stops a route from proxying to a
 * caller-chosen host.
 */
export function refFromRequest(request: Request, id: string): ConnectionRef {
  const cookie = readCookie(
    request,
    `${PROXY_COOKIE_PREFIX}${encodeURIComponent(id)}`
  )
  if (!cookie) return { source: "env", id }
  return { source: "local", connection: JSON.parse(cookie) as Connection }
}

/**
 * Whether the `webdav` client may re-issue a request for this connection. Both
 * `auto` and `digest` send once, read the challenge off a 401, then send again
 * — which a streamed body cannot survive, since it has already been consumed.
 * Callers that stream must buffer instead.
 */
export function connectionReissuesRequests(ref: ConnectionRef): boolean {
  const connection = resolveConnection(ref)
  if (connection.provider !== "webdav") return false

  const authType = connection.authType ?? "password"
  return authType === "auto" || authType === "digest"
}

/** Enforce the per-connection read-only policy before any mutation is signed. */
export function assertConnectionWritable(ref: ConnectionRef): void {
  if (resolveConnection(ref).readOnly) {
    throw new Error("This bucket is read-only.")
  }
}

/** Build a `Files` client straight from a connection (used to test creds). */
export function buildFilesForConnection(connection: Connection): FilesClient {
  return buildFiles(connection)
}
