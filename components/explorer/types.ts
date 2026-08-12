import type { ReactNode, RefObject } from "react"

export type FileSystemView = "icons" | "list" | "columns" | "gallery"

export type FileSystemFolderItem = {
  kind: "folder"
  /** Folder prefix, e.g. `"invoices/2026/"`. A trailing slash is added when missing. */
  path: string
  name?: string
  parentPath?: string
  /** Set when children exist but are not in `items` yet; enables `loadChildren`. */
  hasChildren?: boolean
  createdAt?: string
  updatedAt?: string
}

export type FileSystemFileItem = {
  kind: "file"
  /** Display/canonical path, e.g. `"invoices/2026/jan.pdf"`. */
  path: string
  /** Original object key (S3/R2). Defaults to `path`. */
  key?: string
  name?: string
  parentPath?: string
  contentType?: string
  size?: number
  createdAt?: string
  updatedAt?: string
  etag?: string
  /** Optional if already public/presigned. Otherwise resolved via `getFileUrl`. */
  url?: string
  /** Externally generated thumbnail. */
  previewImageUrl?: string | null
  previewImageUrls?: string[] | null
  previewPageCount?: number
  /** Thumbnail aspect ratio (width / height). */
  previewAspectRatio?: number
  metadata?: Record<string, string>
}

export type FileSystemItem = FileSystemFolderItem | FileSystemFileItem

export type FileSystemLoadChildrenArgs = {
  path: string
  cursor: string | null
}

export type FileSystemLoadChildrenResult = {
  items: FileSystemItem[]
  nextCursor?: string | null
}

export type FileSystemSortKey =
  "createdAt" | "kind" | "name" | "size" | "updatedAt"

export type FileSystemSortState = {
  direction: "asc" | "desc"
  key: FileSystemSortKey
}

export type FileSystemFilterType = "dateCreated" | "dateModified" | "fileType"

export type FileSystemFilterOperator =
  | "after"
  | "before"
  | "in-range"
  | "is"
  | "is-any-of"
  | "is-not"
  | "not-in-range"

export type FileSystemFilter = {
  id: string
  operator: FileSystemFilterOperator
  type: FileSystemFilterType
  value: string[]
}

export type FileSystemViewerKind = "docx" | "image" | "pdf" | "xlsx"

/** Context a view can give `renderFilePreview` about the slot it will fill. */
export type FileSystemPreviewOptions = {
  /** Roughly how wide the preview renders, in CSS pixels. */
  widthHint?: number
}

export type FileSystemProps = {
  items: FileSystemItem[]
  isLoading?: boolean
  reloadToken?: number | string
  className?: string
  title?: string
  titleBadge?: ReactNode
  headerLeading?: ReactNode
  defaultView?: FileSystemView
  view?: FileSystemView
  onViewChangeAction?: (view: FileSystemView) => void
  defaultSort?: FileSystemSortState
  sort?: FileSystemSortState
  onSortChangeAction?: (sort: FileSystemSortState) => void
  defaultFilters?: FileSystemFilter[]
  filters?: FileSystemFilter[]
  onFiltersChangeAction?: (filters: FileSystemFilter[]) => void
  showFileExtensions?: boolean
  /** Show dot-prefixed (hidden) files and folders. Defaults to false. */
  defaultShowHiddenFiles?: boolean
  showHiddenFiles?: boolean
  onShowHiddenFilesChangeAction?: (showHiddenFiles: boolean) => void
  defaultPath?: string
  onPathChangeAction?: (path: string) => void
  onSelectionChange?: (item: FileSystemItem | null) => void
  onCreateFolderAction?: (path: string) => void | Promise<void>
  onDownloadEntry?: (item: FileSystemItem) => void | Promise<void>
  onDeleteEntry?: (item: FileSystemItem) => void | Promise<void>
  /** `onProgress(done, total)` is called as each item completes (for the bar). */
  onDeleteEntries?: (
    items: FileSystemItem[],
    onProgress?: (done: number, total: number) => void
  ) => void | Promise<void>
  onRenameEntryAction?: (
    item: FileSystemItem,
    name: string
  ) => void | Promise<void>
  onMoveEntry?: (
    item: FileSystemItem,
    destinationFolder: string
  ) => void | Promise<void>
  onMoveEntries?: (
    items: FileSystemItem[],
    destinationFolder: string,
    onProgress?: (done: number, total: number) => void
  ) => void | Promise<void>
  isStarred?: (item: FileSystemFileItem) => boolean
  onToggleStar?: (item: FileSystemFileItem) => void
  onFileOpen?: (file: FileSystemFileItem, url: string | null) => void
  getFileUrl?: (file: FileSystemFileItem) => string | Promise<string>
  loadChildren?: (
    args: FileSystemLoadChildrenArgs
  ) => Promise<FileSystemLoadChildrenResult>
  renderFilePreview?: (
    file: FileSystemFileItem,
    options?: FileSystemPreviewOptions
  ) => ReactNode
  loadPreviewImageUrlAction?: (
    file: FileSystemFileItem,
    pageIndex: number
  ) => Promise<string | null>
}

export type FolderEntry = FileSystemFolderItem & {
  name: string
  parentPath: string
}

export type FileEntry = FileSystemFileItem & {
  key: string
  name: string
  parentPath: string
}

export type FileSystemEntry = FolderEntry | FileEntry

export type FileSystemIndex = {
  children: Map<string, FileSystemEntry[]>
  files: Map<string, FileEntry>
  folders: Map<string, FolderEntry>
}

export type SelectionModifiers = {
  range?: boolean
  toggle?: boolean
}

export type FileSystemViewProps = {
  currentPath: string
  entries: FileSystemEntry[]
  fileFilter: ((file: FileEntry) => boolean) | null
  getFileUrl?: (file: FileSystemFileItem) => string | Promise<string>
  index: FileSystemIndex
  loadPreviewImageUrlAction?: (
    file: FileSystemFileItem,
    pageIndex: number
  ) => Promise<string | null>
  loadingFolders: Set<string>
  onOpen: (entry: FileSystemEntry) => void
  onSelect: (
    entry: FileSystemEntry | null,
    modifiers?: SelectionModifiers
  ) => void
  onSelectMany: (entries: FileSystemEntry[]) => void
  onSortColumnClick: (key: FileSystemSortKey) => void
  attachedStagePaths: string[]
  pageUrlCache: Map<string, string>
  poolStagePath: (path: string) => void
  registerStageHost: (path: string, element: HTMLElement | null) => void
  renderFilePreview?: (
    file: FileSystemFileItem,
    options?: FileSystemPreviewOptions
  ) => ReactNode
  searchQuery: string
  selectedEntry: FileSystemEntry | null
  selectedPath: string | null
  selectedPaths: ReadonlySet<string>
  /** Paths currently being dragged (the whole selection when multi-dragging). */
  draggingPaths: ReadonlySet<string>
  sort: FileSystemSortState
  treeExpansionRef: RefObject<Map<string, readonly string[]>>
}
