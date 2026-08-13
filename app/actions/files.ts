"use server"

import type { ConnectionRef } from "@/lib/storage/connection-ref"
import type { Connection } from "@/lib/storage/connections"
import {
  assertConnectionWritable,
  listPublicEnvConnections,
  resolveFiles,
} from "@/lib/storage/connections-server"
import * as fileOps from "@/lib/storage/file-operations"
import type { EntryRef, SignedUpload } from "@/lib/storage/files-client"
import type { FileSystemLoadChildrenResult } from "@/components/explorer/types"

/** The env connections, with credentials stripped, for the sidebar. */
export async function listEnvConnectionsAction(): Promise<Connection[]> {
  return listPublicEnvConnections()
}

/** Validate a connection's credentials + CORS with one cheap round trip. */
export async function testConnectionAction(ref: ConnectionRef): Promise<void> {
  return fileOps.probeConnection(resolveFiles(ref))
}

/** One page of a folder, mapped to the FileSystem manifest shape. */
export async function listFolderAction(
  ref: ConnectionRef,
  prefix: string,
  cursor: string | null
): Promise<FileSystemLoadChildrenResult> {
  return fileOps.listFolder(resolveFiles(ref), prefix, cursor)
}

/** Presigned GET URL for previewing/downloading a single object. */
export async function signFileUrlAction(
  ref: ConnectionRef,
  key: string
): Promise<string> {
  return fileOps.signFileUrl(resolveFiles(ref), key)
}

export async function signFileUrlsAction(
  ref: ConnectionRef,
  keys: string[]
): Promise<Record<string, string>> {
  return fileOps.signFileUrls(resolveFiles(ref), keys)
}

/** Presigned direct-upload descriptor for a browser-to-storage transfer. */
export async function signUploadUrlAction(
  ref: ConnectionRef,
  key: string,
  contentType?: string
): Promise<SignedUpload> {
  assertConnectionWritable(ref)
  return fileOps.signUploadUrl(resolveFiles(ref), key, contentType)
}

/** Create an object-store folder marker at a path ending in `/`. */
export async function createFolderAction(
  ref: ConnectionRef,
  path: string
): Promise<void> {
  assertConnectionWritable(ref)
  return fileOps.createFolder(resolveFiles(ref), path)
}

/** Delete a file or recursively delete every object under a folder. */
export async function deleteEntryAction(
  ref: ConnectionRef,
  item: EntryRef
): Promise<void> {
  assertConnectionWritable(ref)
  return fileOps.deleteEntry(resolveFiles(ref), item)
}

/** Rename a file or recursively move every object under a folder. */
export async function renameEntryAction(
  ref: ConnectionRef,
  item: EntryRef,
  name: string
): Promise<void> {
  assertConnectionWritable(ref)
  return fileOps.renameEntry(resolveFiles(ref), item, name)
}

/** Move a file or folder into another folder (`""` is the bucket root). */
export async function moveEntryAction(
  ref: ConnectionRef,
  item: EntryRef,
  destinationFolder: string
): Promise<void> {
  assertConnectionWritable(ref)
  return fileOps.moveEntry(resolveFiles(ref), item, destinationFolder)
}
