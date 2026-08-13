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

import type { ConnectionRef } from "@/lib/storage/connection-ref"
import {
  ENV_CONNECTION_ID,
  ENV_CONNECTION_ID_PREFIX,
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
      authType: (raw.authType as WebdavAuthType | undefined) ?? undefined,
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
  return ref.connection
}

export function resolveFiles(ref: ConnectionRef): FilesClient {
  return buildFiles(resolveConnection(ref))
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
