"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { getFileKind } from "@/lib/file-kind"
import { useS3FileSystem } from "@/lib/storage/hooks/use-file-system"
import { expandDropEntries, useUploads } from "@/lib/storage/hooks/use-uploads"
import {
  bucketBrowserKey,
  DEFAULT_BUCKET_BROWSER_SETTINGS,
  useBucketBrowserStore,
} from "@/lib/store/bucket-browser-store"
import { useConnections } from "@/lib/store/connection-store"
import {
  useFileMarksStore,
  type MarkedFile,
} from "@/lib/store/file-marks-store"
import { useNavStore } from "@/lib/store/nav-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useUploadUiStore } from "@/lib/store/upload-ui-store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { FileSystem } from "@/components/explorer/file-system"
import { ImageThumbnailPreview } from "@/components/explorer/image-thumbnail-preview"
import type {
  FileSystemFileItem,
  FileSystemPreviewOptions,
} from "@/components/explorer/types"
import {
  AppIcon,
  CloudServerIcon,
  PlusSignCircleIcon,
  Upload01Icon,
} from "@/components/foundations/icons"
import { NEUTRAL_BADGE_CLASSNAME } from "@/components/storage/badge-styles"
import { FileViewerDialog } from "@/components/storage/file-viewer-dialog"
import { MarkedFilesView } from "@/components/storage/marked-files-view"
import { UploadProgressPanel } from "@/components/storage/upload-progress-panel"

const EMPTY_MARKS: MarkedFile[] = []

function MobileSidebarTrigger() {
  const t = useTranslations("Browser")
  return (
    <SidebarTrigger
      aria-label={t("openSidebar")}
      title={t("openSidebar")}
      className="shrink-0 min-[800px]:hidden"
    />
  )
}

function toMarkedFile(file: FileSystemFileItem): MarkedFile {
  return {
    key: file.key ?? file.path,
    path: file.path,
    name: file.name,
    contentType: file.contentType,
    size: file.size,
    updatedAt: file.updatedAt,
  }
}

function fromMarkedFile(file: MarkedFile): FileSystemFileItem {
  return {
    kind: "file",
    path: file.path,
    key: file.key,
    name: file.name,
    contentType: file.contentType,
    size: file.size,
    updatedAt: file.updatedAt,
  }
}

function EmptyState() {
  const t = useTranslations("Browser")
  const { openAddDialog } = useConnections()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <AppIcon icon={CloudServerIcon} className="size-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{t("noBucketTitle")}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t("noBucketDescription")}
        </p>
      </div>
      <Button onClick={openAddDialog}>
        <AppIcon icon={PlusSignCircleIcon} className="size-4" />
        {t("addConnection")}
      </Button>
    </div>
  )
}

export function FileBrowser() {
  const t = useTranslations("Browser")
  const { activeConnection, hasHydrated } = useConnections()
  const isReadOnly = activeConnection?.readOnly === true
  const bucketKey = activeConnection ? bucketBrowserKey(activeConnection) : ""
  const browserSettings = useBucketBrowserStore(
    (state) => state.buckets[bucketKey] ?? DEFAULT_BUCKET_BROWSER_SETTINGS
  )
  const setBucketView = useBucketBrowserStore((state) => state.setView)
  const setBucketSort = useBucketBrowserStore((state) => state.setSort)
  const setBucketFilters = useBucketBrowserStore((state) => state.setFilters)
  const showFileExtensions = usePreferencesStore(
    (state) => state.showFileExtensions
  )
  const showImagePreviews = usePreferencesStore(
    (state) => state.showImagePreviews
  )
  const showHiddenFiles = usePreferencesStore((state) => state.showHiddenFiles)
  const setShowHiddenFiles = usePreferencesStore(
    (state) => state.setShowHiddenFiles
  )
  const section = useNavStore((state) => state.section)
  const recents = useFileMarksStore(
    (state) => state.buckets[bucketKey]?.recents ?? EMPTY_MARKS
  )
  const starred = useFileMarksStore(
    (state) => state.buckets[bucketKey]?.starred ?? EMPTY_MARKS
  )
  const recordRecent = useFileMarksStore((state) => state.recordRecent)
  const toggleStar = useFileMarksStore((state) => state.toggleStar)
  const clearRecents = useFileMarksStore((state) => state.clearRecents)
  const starredKeys = React.useMemo(
    () => new Set(starred.map((file) => file.key)),
    [starred]
  )
  const {
    items,
    loadChildren,
    getFileUrl,
    uploadFile,
    createFolder,
    downloadEntry,
    deleteEntry,
    renameEntry,
    moveEntry,
    refresh,
    thumbnailHandle,
    isLoading,
    error,
  } = useS3FileSystem(activeConnection)
  const [imagePreviewUrlCache] = React.useState(() => new Map<string, string>())
  const renderFilePreview = React.useCallback(
    (file: FileSystemFileItem, options?: FileSystemPreviewOptions) => {
      if (!showImagePreviews || getFileKind(file) !== "image") return null

      return (
        <ImageThumbnailPreview
          cacheKey={`${activeConnection?.id ?? ""}\u0000${file.path}`}
          file={file}
          getFileUrl={getFileUrl}
          urlCache={imagePreviewUrlCache}
          thumbnailHandle={thumbnailHandle}
          widthHint={options?.widthHint}
        />
      )
    },
    [
      activeConnection?.id,
      getFileUrl,
      imagePreviewUrlCache,
      showImagePreviews,
      thumbnailHandle,
    ]
  )
  const [opened, setOpened] = React.useState<{
    file: FileSystemFileItem
    url: string | null
  } | null>(null)
  // The Upload trigger lives in the sidebar, but the file input (and the
  // current folder) live here. Expose an opener through the shared store so the
  // sidebar can pop the native picker; selected files upload straight to the
  // current folder, no intermediate dialog.
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const setPickFiles = useUploadUiStore((state) => state.setPickFiles)
  React.useEffect(() => {
    setPickFiles(isReadOnly ? null : () => fileInputRef.current?.click())
    return () => setPickFiles(null)
  }, [isReadOnly, setPickFiles])
  // The folder FileSystem is currently showing, tagged with the connection it
  // belongs to. On a connection switch the path is stale, so we fall back to
  // the root — otherwise the remount opens a non-root folder with no back
  // history and the back button gets stuck disabled.
  const [folder, setFolder] = React.useState<{ connId: string; path: string }>({
    connId: "",
    path: "",
  })
  const currentPath = folder.connId === activeConnection?.id ? folder.path : ""
  const [isDragging, setIsDragging] = React.useState(false)
  const dragDepth = React.useRef(0)
  // Bumped after a mutation (upload/delete/rename) and passed to FileSystem as
  // `reloadToken`, which re-lists the current folder in place — no remount, so
  // navigation history and the current location survive.
  const [refreshNonce, setRefreshNonce] = React.useState(0)

  const { tasks, enqueue, dismiss, clearFinished, activeCount } = useUploads({
    uploadFile,
    onBatchComplete: () => {
      // Re-fetch the root listing and bump the reload token so the current
      // folder re-lists while staying put.
      refresh()
      setRefreshNonce((n) => n + 1)
    },
  })

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    if (section !== "all" || isReadOnly) return

    // Read the entries synchronously — `DataTransfer` is emptied the moment
    // this handler returns, so it cannot be touched after an await. A dropped
    // folder only reveals its contents through the entry API; `files` alone
    // would report it as one unreadable entry.
    const entries = Array.from(e.dataTransfer.items)
      .map((item) => item.webkitGetAsEntry())
      .filter((entry): entry is FileSystemEntry => entry !== null)
    const plainFiles = Array.from(e.dataTransfer.files)

    void (async () => {
      const items = entries.length
        ? await expandDropEntries(entries)
        : plainFiles.map((file) => ({ file, path: file.name }))
      enqueue(items, currentPath)
    })()
  }

  // Opening any file (from the browser or the Recents/Starred lists) records it
  // as recent. Marked-list opens also re-resolve a fresh URL via the S3 key.
  const openFile = (file: FileSystemFileItem, url: string | null) => {
    recordRecent(bucketKey, toMarkedFile(file))
    setOpened({ file, url })
  }

  const openMarkedFile = async (marked: MarkedFile) => {
    const file = fromMarkedFile(marked)
    recordRecent(bucketKey, marked)
    let url: string | null = null
    try {
      url = await getFileUrl(file)
    } catch {
      url = null
    }
    setOpened({ file, url })
  }

  // Until the persisted store rehydrates, we don't yet know if a bucket is
  // connected — render nothing rather than flashing the "No bucket" empty state.
  if (!hasHydrated) {
    return <div className="h-full" />
  }

  if (!activeConnection) {
    return <EmptyState />
  }

  if (error && !isLoading && section === "all") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <h2 className="text-base font-semibold">Couldn’t load this bucket</h2>
        <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        <p className="text-xs text-muted-foreground">
          Check the credentials and that the bucket’s CORS policy allows this
          origin.
        </p>
      </div>
    )
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragEnter={(e) => {
        if (section !== "all" || isReadOnly) return
        if (!Array.from(e.dataTransfer.types).includes("Files")) return
        dragDepth.current += 1
        setIsDragging(true)
      }}
      onDragOver={(e) => {
        if (isReadOnly) return
        if (Array.from(e.dataTransfer.types).includes("Files"))
          e.preventDefault()
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setIsDragging(false)
      }}
      onDrop={handleDrop}
    >
      {section === "all" ? (
        <FileSystem
          key={activeConnection.id}
          items={items}
          isLoading={isLoading}
          reloadToken={refreshNonce}
          title={activeConnection.name}
          titleBadge={
            isReadOnly ? (
              <Badge variant="outline" className={NEUTRAL_BADGE_CLASSNAME}>
                {t("readOnly")}
              </Badge>
            ) : undefined
          }
          headerLeading={<MobileSidebarTrigger />}
          view={browserSettings.view}
          onViewChangeAction={(view) => setBucketView(bucketKey, view)}
          sort={browserSettings.sort}
          onSortChangeAction={(sort) => setBucketSort(bucketKey, sort)}
          filters={browserSettings.filters}
          onFiltersChangeAction={(filters) =>
            setBucketFilters(bucketKey, filters)
          }
          showHiddenFiles={showHiddenFiles}
          onShowHiddenFilesChangeAction={setShowHiddenFiles}
          showFileExtensions={showFileExtensions}
          className="min-h-0 flex-1 rounded-none border-0"
          defaultPath={currentPath}
          loadChildren={loadChildren}
          getFileUrl={getFileUrl}
          renderFilePreview={renderFilePreview}
          onCreateFolderAction={
            isReadOnly
              ? undefined
              : async (path) => {
                  await createFolder(path)
                  refresh()
                  setRefreshNonce((nonce) => nonce + 1)
                }
          }
          onDownloadEntry={downloadEntry}
          onDeleteEntry={
            isReadOnly
              ? undefined
              : async (item) => {
                  await deleteEntry(item)
                  refresh()
                  setRefreshNonce((nonce) => nonce + 1)
                }
          }
          onDeleteEntries={
            isReadOnly
              ? undefined
              : async (items, onProgress) => {
                  let done = 0
                  for (const item of items) {
                    await deleteEntry(item)
                    onProgress?.(++done, items.length)
                  }
                  refresh()
                  setRefreshNonce((nonce) => nonce + 1)
                }
          }
          onRenameEntryAction={
            isReadOnly
              ? undefined
              : async (item, name) => {
                  await renameEntry(item, name)
                  refresh()
                  setRefreshNonce((nonce) => nonce + 1)
                }
          }
          onMoveEntry={
            isReadOnly
              ? undefined
              : async (item, destinationFolder) => {
                  await moveEntry(item, destinationFolder)
                  refresh()
                  setRefreshNonce((nonce) => nonce + 1)
                }
          }
          onMoveEntries={
            isReadOnly
              ? undefined
              : async (items, destinationFolder, onProgress) => {
                  let done = 0
                  for (const item of items) {
                    await moveEntry(item, destinationFolder)
                    onProgress?.(++done, items.length)
                  }
                  refresh()
                  setRefreshNonce((nonce) => nonce + 1)
                }
          }
          isStarred={(item) => starredKeys.has(item.key ?? item.path)}
          onToggleStar={(item) => toggleStar(bucketKey, toMarkedFile(item))}
          onPathChangeAction={(path) =>
            setFolder({ connId: activeConnection.id, path })
          }
          onFileOpen={openFile}
        />
      ) : (
        <MarkedFilesView
          section={section}
          connectionName={activeConnection.name}
          headerLeading={<MobileSidebarTrigger />}
          files={section === "recents" ? recents : starred}
          isStarredAction={(key) => starredKeys.has(key)}
          onOpenAction={openMarkedFile}
          onToggleStarAction={(file) => toggleStar(bucketKey, file)}
          onClearRecentsAction={() => clearRecents(bucketKey)}
          showFileExtensions={showFileExtensions}
        />
      )}

      {isDragging ? (
        <div className="pointer-events-none absolute inset-0 z-40 p-2.5">
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/4 backdrop-blur-[1px]">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <AppIcon icon={Upload01Icon} className="size-6" />
            </div>
            <div className="space-y-0.5 text-center">
              <p className="text-sm font-medium">{t("dropTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {currentPath
                  ? t("dropToPath", { path: currentPath })
                  : t("dropToRoot")}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <FileViewerDialog
        file={opened?.file ?? null}
        url={opened?.url ?? null}
        open={opened !== null}
        onOpenChangeAction={(next) => {
          if (!next) setOpened(null)
        }}
        isStarred={
          opened ? starredKeys.has(opened.file.key ?? opened.file.path) : false
        }
        onToggleStarAction={
          opened
            ? () => toggleStar(bucketKey, toMarkedFile(opened.file))
            : undefined
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (!isReadOnly && e.target.files?.length) {
            enqueue(
              Array.from(e.target.files).map((file) => ({
                file,
                path: file.webkitRelativePath || file.name,
              })),
              currentPath
            )
          }
          e.target.value = ""
        }}
      />

      <UploadProgressPanel
        tasks={tasks}
        activeCount={activeCount}
        onDismissAction={dismiss}
        onClearAction={clearFinished}
      />
    </div>
  )
}
