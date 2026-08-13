/**
 * Browser-side `files-sdk` client builder for direct client requests.
 *
 * This module (and the `files-sdk` adapters + AWS SDK it pulls in) must only ever
 * be reached through `await import("@/lib/storage/connections-client")`, so the
 * AWS SDK stays out of the default bundle for users who don't enable the toggle.
 * A single static import of this file anywhere would defeat that. It deliberately
 * mirrors `buildFiles` from `connections-server.ts` rather than importing it —
 * that module is `"server-only"`.
 */
import { createFiles as createFilesSdk } from "files-sdk"
import { alibaba } from "files-sdk/alibaba"
import { backblazeB2 } from "files-sdk/backblaze-b2"
import { minio } from "files-sdk/minio"
import { r2 } from "files-sdk/r2"
import { s3 } from "files-sdk/s3"
import { tencent } from "files-sdk/tencent"
import { webdav } from "files-sdk/webdav"
import { zip } from "files-sdk/zip"

import type { Connection } from "@/lib/storage/connections"
import type { FilesClient } from "@/lib/storage/files-client"

/** Build a `Files` client in the browser from a local connection's credentials. */
export function buildFilesForConnectionClient(
  connection: Connection
): FilesClient {
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
    plugins: [zip()],
  })
}
