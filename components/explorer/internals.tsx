import * as React from "react"
import {
  createFileTreeIconResolver,
  getBuiltInSpriteSheet,
} from "@pierre/trees"
import { useTranslations } from "next-intl"

import type { TimeFormat } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"
import { FileThumbnail } from "@/components/explorer/file-thumbnail"
import type {
  FileEntry,
  FileSystemEntry,
  FileSystemFileItem,
  FileSystemFilter,
  FileSystemFilterOperator,
  FileSystemFilterType,
  FileSystemIndex,
  FileSystemItem,
  FileSystemPreviewOptions,
  FileSystemSortKey,
  FileSystemSortState,
  FileSystemViewerKind,
  FolderEntry,
} from "@/components/explorer/types"
import {
  AppIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
} from "@/components/foundations/icons"

export const LazyPDFViewer = React.lazy(() =>
  import("@/components/viewers/pdf/pdf-viewer").then((mod) => ({
    default: mod.PDFViewer,
  }))
)
export const LazyDocxViewerPreview = React.lazy(() =>
  import("@/components/viewers/docx/docx-viewer").then((mod) => ({
    default: mod.DocxViewerPreview,
  }))
)
export const LazyXlsxViewerPreview = React.lazy(() =>
  import("@/components/viewers/xlsx/xlsx-viewer").then((mod) => ({
    default: mod.XlsxViewerPreview,
  }))
)

export function normalizeFolderPath(path: string) {
  if (!path || path === "/") return ""
  return path.endsWith("/") ? path : `${path}/`
}

export function pathName(path: string) {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path
  const separatorIndex = trimmed.lastIndexOf("/")
  return separatorIndex === -1 ? trimmed : trimmed.slice(separatorIndex + 1)
}

export function pathParent(path: string) {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path
  const separatorIndex = trimmed.lastIndexOf("/")
  return separatorIndex === -1 ? "" : trimmed.slice(0, separatorIndex + 1)
}

// A path is "hidden" when any of its segments starts with a dot — dotfiles
// (`.env`) and dotfolders (`.config/`) alike. `.` / `..` never appear in
// storage keys but are excluded defensively.
export function isHiddenPath(path: string) {
  return path
    .split("/")
    .some(
      (segment) =>
        segment.startsWith(".") && segment !== "." && segment !== ".."
    )
}

export function fileExtension(name: string) {
  const dotIndex = name.lastIndexOf(".")
  return dotIndex === -1 ? "" : name.slice(dotIndex + 1).toLowerCase()
}

// Controls whether file names render with their extension. Folders, dotfiles
// (e.g. `.env`), and extension-less names are always shown in full; only a
// trailing extension on a regular file is hidden when this is off.
export const ShowFileExtensionsContext = React.createContext(true)

export function formatEntryName(
  entry: FileSystemEntry,
  showFileExtensions: boolean
) {
  if (showFileExtensions || entry.kind === "folder") return entry.name
  const dotIndex = entry.name.lastIndexOf(".")
  return dotIndex <= 0 ? entry.name : entry.name.slice(0, dotIndex)
}

export function useFormatEntryName() {
  const showFileExtensions = React.useContext(ShowFileExtensionsContext)
  return React.useCallback(
    (entry: FileSystemEntry) => formatEntryName(entry, showFileExtensions),
    [showFileExtensions]
  )
}

export type RenameController = {
  /** Paths whose rename is saving in the background (show a spinner). */
  pendingPaths: ReadonlySet<string>
}

export const RenameContext = React.createContext<RenameController | null>(null)

export const FILE_KIND_LABELS: Record<string, string> = {
  css: "CSS Stylesheet",
  csv: "CSV Document",
  doc: "Word Document",
  docx: "Word Document",
  gif: "GIF Image",
  go: "Go Source",
  jpeg: "JPEG Image",
  jpg: "JPEG Image",
  js: "JavaScript Source",
  json: "JSON Document",
  jsx: "JavaScript Source",
  md: "Markdown Document",
  mdx: "MDX Document",
  pdf: "PDF Document",
  png: "PNG Image",
  ppt: "PowerPoint Presentation",
  pptx: "PowerPoint Presentation",
  py: "Python Script",
  rs: "Rust Source",
  sh: "Shell Script",
  sql: "SQL Script",
  svg: "SVG Image",
  ts: "TypeScript Source",
  tsv: "TSV Document",
  tsx: "TypeScript Source",
  txt: "Plain Text",
  webp: "WebP Image",
  xls: "Excel Workbook",
  xlsx: "Excel Workbook",
  yaml: "YAML Document",
  yml: "YAML Document",
  zip: "ZIP Archive",
}

export function fileKindLabel(file: FileEntry) {
  const byExtension = FILE_KIND_LABELS[fileExtension(file.name)]
  const contentType = normalizedContentType(file.contentType)

  if (byExtension) return byExtension
  if (contentType?.startsWith("image/")) return "Image"
  if (contentType === FALLBACK_MIME_TYPE) return "Binary"

  return contentType ?? "Document"
}

// Folders sort under the "Folder" kind alphabetically among the file kinds,
// like Finder's Kind sort.
export function entryKindLabel(entry: FileSystemEntry) {
  return entry.kind === "folder" ? "Folder" : fileKindLabel(entry)
}

// MIME types inferred from the extension when a file carries no
// `contentType`, so the file-type filter can classify every manifest entry.
export const EXTENSION_MIME_TYPES: Record<string, string> = {
  css: "text/css",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  gif: "image/gif",
  go: "text/x-go",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript",
  json: "application/json",
  jsx: "text/jsx",
  md: "text/markdown",
  mdx: "text/mdx",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  py: "text/x-python",
  rs: "text/x-rust",
  sh: "application/x-sh",
  sql: "application/sql",
  svg: "image/svg+xml",
  ts: "text/x-typescript",
  tsv: "text/tab-separated-values",
  tsx: "text/x-typescript",
  txt: "text/plain",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  yaml: "text/yaml",
  yml: "text/yaml",
  zip: "application/zip",
}

export const FALLBACK_MIME_TYPE = "application/octet-stream"
export const IPAD_MIN_WIDTH = 768

export const MIME_TYPE_LABELS: Record<string, string> = {
  [FALLBACK_MIME_TYPE]: "Binary",
  "application/json": "JSON",
  "application/msword": "Word document (legacy)",
  "application/pdf": "PDF",
  "application/sql": "SQL",
  "application/vnd.ms-excel": "Excel workbook (legacy)",
  "application/vnd.ms-powerpoint": "PowerPoint (legacy)",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "PowerPoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "Excel workbook",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word document",
  "application/x-sh": "Shell script",
  "application/zip": "ZIP archive",
  "image/gif": "GIF image",
  "image/jpeg": "JPEG image",
  "image/png": "PNG image",
  "image/svg+xml": "SVG image",
  "image/webp": "WebP image",
  "text/css": "CSS",
  "text/csv": "CSV",
  "text/javascript": "JavaScript",
  "text/jsx": "JSX",
  "text/markdown": "Markdown",
  "text/mdx": "MDX",
  "text/plain": "Plain text",
  "text/tab-separated-values": "TSV",
  "text/x-go": "Go",
  "text/x-python": "Python",
  "text/x-rust": "Rust",
  "text/x-typescript": "TypeScript",
  "text/yaml": "YAML",
}

function normalizedContentType(contentType: string | undefined) {
  return contentType?.split(";")[0]?.trim().toLowerCase() || undefined
}

export function mimeTypeForFile(file: FileEntry) {
  const contentType = normalizedContentType(file.contentType)
  const byExtension = EXTENSION_MIME_TYPES[fileExtension(file.name)]

  return (
    (contentType === FALLBACK_MIME_TYPE ? byExtension : contentType) ??
    byExtension ??
    FALLBACK_MIME_TYPE
  )
}

export function fileTypeFilterGroup(mime: string): FileTypeFilterGroup {
  if (
    mime === "application/pdf" ||
    mime === "application/msword" ||
    mime === "application/vnd.ms-powerpoint" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "Documents"
  }

  if (
    mime === "application/vnd.ms-excel" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "text/csv" ||
    mime === "text/tab-separated-values"
  ) {
    return "Spreadsheets"
  }

  if (mime.startsWith("image/")) return "Images"

  if (
    mime === "application/json" ||
    mime === "application/sql" ||
    mime === "application/x-sh" ||
    mime === "text/css" ||
    mime === "text/javascript" ||
    mime === "text/jsx" ||
    mime === "text/x-go" ||
    mime === "text/x-python" ||
    mime === "text/x-rust" ||
    mime === "text/x-typescript" ||
    mime === "text/yaml"
  ) {
    return "Code"
  }

  if (
    mime === "text/markdown" ||
    mime === "text/mdx" ||
    mime === "text/plain"
  ) {
    return "Text"
  }

  return "Archives & binary"
}

export function viewerKindForFile(
  file: FileSystemFileItem
): FileSystemViewerKind | null {
  if (file.contentType?.startsWith("image/")) return "image"
  if (file.contentType === "application/pdf") return "pdf"

  const name = (file.name ?? file.path).toLowerCase()

  if (name.endsWith(".pdf")) return "pdf"
  if (name.endsWith(".docx")) return "docx"
  if (name.endsWith(".xlsx")) return "xlsx"
  if (/\.(avif|gif|jpe?g|png|svg|webp)$/.test(name)) return "image"

  return null
}

// PDF and DOCX pages want height; spreadsheets want width; images get a
// roomy but contained frame.
export const VIEWER_DIALOG_CLASSNAMES: Record<FileSystemViewerKind, string> = {
  docx: "h-[88vh] w-[min(96vw,68rem)] max-w-none",
  image: "max-h-[88vh] w-fit max-w-[min(96vw,64rem)]",
  pdf: "h-[88vh] w-[min(96vw,68rem)] max-w-none",
  xlsx: "h-[85vh] w-[min(96vw,100rem)] max-w-none",
}

export function FileSystemViewerLoading() {
  return (
    <div className="grid h-full min-h-48 flex-1 place-items-center bg-background">
      <Spinner className="size-4 text-muted-foreground" />
    </div>
  )
}

export function formatByteSize(size: number | undefined) {
  if (size === undefined) return null
  if (size < 1000) return `${size} bytes`

  const units = ["KB", "MB", "GB", "TB"]
  let value = size

  for (const unit of units) {
    value /= 1000
    if (value < 1000 || unit === "TB") {
      return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2).replace(/\.?0+$/, "")} ${unit}`
    }
  }

  return null
}

export function formatTimestamp(
  value: string | undefined,
  timeFormat: TimeFormat = "12h"
) {
  if (!value) return null

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return null

  const day = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    hourCycle: timeFormat === "24h" ? "h23" : "h12",
    minute: "2-digit",
  })

  return `${day} at ${time}`
}

// Every directory prefix appearing in the given relative file paths.
export function directoryPathsOf(paths: readonly string[]) {
  const directoryPaths = new Set<string>()

  for (const relativePath of paths) {
    let slashIndex = relativePath.indexOf("/")

    while (slashIndex !== -1) {
      directoryPaths.add(relativePath.slice(0, slashIndex))
      slashIndex = relativePath.indexOf("/", slashIndex + 1)
    }
  }
  return directoryPaths
}

export function compareEntryNames(
  left: { name: string },
  right: { name: string }
) {
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

export const SORT_OPTIONS: Array<{
  defaultDirection: "asc" | "desc"
  key: FileSystemSortKey
  label: string
  /** Shorter label so the toolbar trigger stays narrow. */
  triggerLabel: string
}> = [
  { defaultDirection: "asc", key: "name", label: "Name", triggerLabel: "Name" },
  { defaultDirection: "asc", key: "kind", label: "Kind", triggerLabel: "Kind" },
  {
    defaultDirection: "desc",
    key: "createdAt",
    label: "Date created",
    triggerLabel: "Created",
  },
  {
    defaultDirection: "desc",
    key: "updatedAt",
    label: "Date modified",
    triggerLabel: "Modified",
  },
  {
    defaultDirection: "desc",
    key: "size",
    label: "Size",
    triggerLabel: "Size",
  },
]

export const DEFAULT_SORT: FileSystemSortState = {
  direction: "asc",
  key: "name",
}

export function defaultSortDirection(key: FileSystemSortKey) {
  return (
    SORT_OPTIONS.find((option) => option.key === key)?.defaultDirection ?? "asc"
  )
}

export function entrySortTimestamp(
  entry: FileSystemEntry,
  key: "createdAt" | "updatedAt"
) {
  const value = entry[key]
  const time = value ? Date.parse(value) : Number.NaN

  return Number.isNaN(time) ? 0 : time
}

// Primary key per the active sort; ties (and missing metadata) fall back to
// the name order so results stay stable. The name tiebreak ignores the
// direction, like Finder.
export function compareEntriesBySort(
  left: FileSystemEntry,
  right: FileSystemEntry,
  sort: FileSystemSortState
) {
  let result = 0

  if (sort.key === "name") {
    result = compareEntryNames(left, right)
  } else if (sort.key === "kind") {
    result = entryKindLabel(left).localeCompare(
      entryKindLabel(right),
      undefined,
      {
        sensitivity: "base",
      }
    )
  } else if (sort.key === "size") {
    // Folders have no byte size; group them at the small end.
    const leftSize = left.kind === "file" ? (left.size ?? 0) : -1
    const rightSize = right.kind === "file" ? (right.size ?? 0) : -1

    result = leftSize - rightSize
  } else {
    result =
      entrySortTimestamp(left, sort.key) - entrySortTimestamp(right, sort.key)
  }

  if (result === 0) return compareEntryNames(left, right)
  return sort.direction === "asc" ? (result < 0 ? -1 : 1) : result < 0 ? 1 : -1
}

export type FileSystemDateFilterType = Exclude<FileSystemFilterType, "fileType">

export function createFileSystemFilterId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `filter-${crypto.randomUUID()}`
  }
  return `filter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export type FileTypeFilterGroup =
  | "Documents"
  | "Spreadsheets"
  | "Images"
  | "Code"
  | "Text"
  | "Archives & binary"

export type FileTypeFilterOption = {
  group: FileTypeFilterGroup
  /** Sample file name so the option icon reuses the file-type sprite. */
  iconFileName: string
  label: string
  mime: string
}

export const FILE_TYPE_FILTER_GROUPS: FileTypeFilterGroup[] = [
  "Documents",
  "Spreadsheets",
  "Images",
  "Code",
  "Text",
  "Archives & binary",
]

export const FILTER_TYPE_LABELS: Record<FileSystemFilterType, string> = {
  dateCreated: "Date created",
  dateModified: "Date modified",
  fileType: "File type",
}

export const FILTER_OPERATOR_LABELS: Record<FileSystemFilterOperator, string> =
  {
    after: "after",
    before: "before",
    "in-range": "in range",
    is: "is",
    "is-any-of": "is any of",
    "is-not": "is not",
    "not-in-range": "not in range",
  }

// Relative cutoffs for the date filters, mirroring Extend's table filters.
export const DATE_FILTER_PRESETS = [
  "1 day ago",
  "3 days ago",
  "1 week ago",
  "1 month ago",
  "3 months ago",
  "6 months ago",
  "1 year ago",
]

export function dateFilterPresetCutoff(preset: string) {
  const date = new Date()

  switch (preset) {
    case "1 day ago":
      date.setDate(date.getDate() - 1)
      break
    case "3 days ago":
      date.setDate(date.getDate() - 3)
      break
    case "1 week ago":
      date.setDate(date.getDate() - 7)
      break
    case "1 month ago":
      date.setMonth(date.getMonth() - 1)
      break
    case "3 months ago":
      date.setMonth(date.getMonth() - 3)
      break
    case "6 months ago":
      date.setMonth(date.getMonth() - 6)
      break
    case "1 year ago":
      date.setFullYear(date.getFullYear() - 1)
      break
    default: {
      const parsed = Date.parse(preset)

      if (!Number.isNaN(parsed)) return new Date(parsed)
    }
  }
  return date
}

// Custom ranges store two ISO timestamps instead of a relative preset.
export function isCustomDateRangeValue(value: string[]) {
  return (
    value.length === 2 &&
    value.every(
      (entry) =>
        !DATE_FILTER_PRESETS.includes(entry) && !Number.isNaN(Date.parse(entry))
    )
  )
}

export function filterOperatorChoices(
  filter: FileSystemFilter
): FileSystemFilterOperator[] {
  if (filter.type === "fileType") {
    return filter.value.length > 1 ? ["is-any-of", "is-not"] : ["is", "is-not"]
  }
  if (isCustomDateRangeValue(filter.value)) return ["in-range", "not-in-range"]
  return ["before", "after"]
}

export function fileMatchesFilter(file: FileEntry, filter: FileSystemFilter) {
  if (filter.value.length === 0) return true
  if (filter.type === "fileType") {
    const matches = filter.value.includes(mimeTypeForFile(file))

    return filter.operator === "is-not" ? !matches : matches
  }

  const timestamp =
    filter.type === "dateCreated" ? file.createdAt : file.updatedAt
  const time = timestamp ? Date.parse(timestamp) : Number.NaN

  if (Number.isNaN(time)) return false
  if (filter.operator === "in-range" || filter.operator === "not-in-range") {
    const from = Date.parse(filter.value[0])
    const to = Date.parse(filter.value[1] ?? filter.value[0])
    const isInRange = time >= from && time <= to

    return filter.operator === "not-in-range" ? !isInRange : isInRange
  }

  const cutoff = dateFilterPresetCutoff(filter.value[0]).getTime()

  return filter.operator === "before" ? time <= cutoff : time >= cutoff
}

export function buildFileSystemIndex(items: FileSystemItem[]): FileSystemIndex {
  const folders = new Map<string, FolderEntry>()
  const files = new Map<string, FileEntry>()

  const ensureFolderChain = (folderPath: string) => {
    let path = normalizeFolderPath(folderPath)

    while (path && !folders.has(path)) {
      folders.set(path, {
        kind: "folder",
        name: pathName(path),
        parentPath: pathParent(path),
        path,
      })
      path = pathParent(path)
    }
  }

  for (const item of items) {
    if (item.kind === "folder") {
      const path = normalizeFolderPath(item.path)

      if (!path) continue

      folders.set(path, {
        ...item,
        name: item.name ?? pathName(path),
        parentPath: normalizeFolderPath(item.parentPath ?? pathParent(path)),
        path,
      })
      ensureFolderChain(pathParent(path))
    } else {
      if (!item.path) continue

      files.set(item.path, {
        ...item,
        key: item.key ?? item.path,
        name: item.name ?? pathName(item.path),
        parentPath: normalizeFolderPath(
          item.parentPath ?? pathParent(item.path)
        ),
      })
      ensureFolderChain(pathParent(item.path))
    }
  }

  const children = new Map<string, FileSystemEntry[]>()
  const pushChild = (entry: FileSystemEntry) => {
    const siblings = children.get(entry.parentPath)

    if (siblings) {
      siblings.push(entry)
    } else {
      children.set(entry.parentPath, [entry])
    }
  }

  for (const folder of folders.values()) pushChild(folder)
  for (const file of files.values()) pushChild(file)
  for (const siblings of children.values()) {
    siblings.sort(compareEntryNames)
  }

  // Folders without an explicit modified date inherit their newest child's —
  // object stores carry no folder metadata, yet the list view shows the
  // column and the date sorts compare it. Deepest first (a descendant's path
  // is always longer than its ancestor's) so dates propagate up the chain.
  const foldersDeepestFirst = [...folders.values()].sort(
    (left, right) => right.path.length - left.path.length
  )

  for (const folder of foldersDeepestFirst) {
    if (folder.updatedAt) continue

    let newestTime = Number.NEGATIVE_INFINITY
    let newestValue: string | undefined

    for (const child of children.get(folder.path) ?? []) {
      const value = child.updatedAt ?? child.createdAt
      const time = value ? Date.parse(value) : Number.NaN

      if (!Number.isNaN(time) && time > newestTime) {
        newestTime = time
        newestValue = value
      }
    }
    if (newestValue) folder.updatedAt = newestValue
  }

  return { children, files, folders }
}

export function folderHasChildren(index: FileSystemIndex, folder: FolderEntry) {
  return (
    (index.children.get(folder.path)?.length ?? 0) > 0 ||
    folder.hasChildren === true
  )
}

// A single SVG source so the same glyph renders as a React element, inside the
// @pierre/trees shadow DOM (via CSS url()), and stays pixel-identical in both.
export const FOLDER_GLYPH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 50" width="64" height="50"><defs><linearGradient id="fs-folder-back" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3dabf5"/><stop offset="1" stop-color="#1d84dd"/></linearGradient><linearGradient id="fs-folder-front" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7accfb"/><stop offset="1" stop-color="#37a0ef"/></linearGradient></defs><path d="M5 10c0-3.31 2.69-6 6-6h10.9c1.6 0 3.13.7 4.18 1.9l1.5 1.73a3.5 3.5 0 0 0 2.64 1.22H54c2.76 0 5 2.24 5 5V40c0 3.87-3.13 7-7 7H12c-3.87 0-7-3.13-7-7V10Z" fill="url(#fs-folder-back)"/><path d="M5 15.5h54V40c0 3.87-3.13 7-7 7H12c-3.87 0-7-3.13-7-7V15.5Z" fill="url(#fs-folder-front)"/></svg>`

export const FOLDER_GLYPH_DATA_URL = `data:image/svg+xml,${encodeURIComponent(FOLDER_GLYPH_SVG)}`

export function FileSystemFolderGlyph({ className }: { className?: string }) {
  return (
    <img
      src={FOLDER_GLYPH_DATA_URL}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
    />
  )
}

export function escapeXmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

// The @pierre/trees "complete" set — the full, colored suite with brand and
// framework glyphs — ships as an SVG sprite. The list view tree consumes it
// natively inside its shadow DOM; the icon, column, and gallery views render
// the same sprite from the light DOM so every view falls back to the same
// file-type icon when a file has no thumbnail.
export const FILE_ICON_SPRITE_SHEET = getBuiltInSpriteSheet("complete")

const { resolveIcon: resolveFileIcon } = createFileTreeIconResolver({
  colored: true,
  set: "complete",
})

// Per-token light/dark colors mirroring the palette the tree applies inside
// its shadow DOM. Tokens without an entry (font, nextjs, stylelint) stay
// muted-foreground there too.
export const FILE_ICON_COLORS: Record<string, [light: string, dark: string]> = {
  astro: ["#a631be", "#d568ea"],
  babel: ["#d5a910", "#ffd452"],
  bash: ["#199f43", "#5ecc71"],
  biome: ["#1a85d4", "#69b1ff"],
  bootstrap: ["#693acf", "#9d6afb"],
  browserslist: ["#d5a910", "#ffd452"],
  bun: ["#594c5b", "#79697b"],
  c: ["#1a85d4", "#69b1ff"],
  claude: ["#d47628", "#ffa359"],
  cpp: ["#1a85d4", "#69b1ff"],
  css: ["#693acf", "#9d6afb"],
  database: ["#a631be", "#d568ea"],
  default: ["#84848a", "#adadb1"],
  docker: ["#1a85d4", "#69b1ff"],
  eslint: ["#693acf", "#9d6afb"],
  git: ["#ff8c5b", "#d5512f"],
  go: ["#1ca1c7", "#68cdf2"],
  graphql: ["#d32a61", "#ff678d"],
  html: ["#d47628", "#ffa359"],
  image: ["#d32a61", "#ff678d"],
  javascript: ["#d5a910", "#ffd452"],
  json: ["#d47628", "#ffa359"],
  markdown: ["#199f43", "#5ecc71"],
  mcp: ["#17a5af", "#64d1db"],
  npm: ["#d52c36", "#ff6762"],
  oxc: ["#1ca1c7", "#68cdf2"],
  postcss: ["#d52c36", "#ff6762"],
  prettier: ["#17a5af", "#64d1db"],
  python: ["#1a85d4", "#69b1ff"],
  react: ["#1ca1c7", "#68cdf2"],
  ruby: ["#d52c36", "#ff6762"],
  rust: ["#d47628", "#ffa359"],
  sass: ["#d32a61", "#ff678d"],
  svelte: ["#d52c36", "#ff6762"],
  svg: ["#d47628", "#ffa359"],
  svgo: ["#199f43", "#5ecc71"],
  swift: ["#d47628", "#ffa359"],
  table: ["#17a5af", "#64d1db"],
  tailwind: ["#1ca1c7", "#68cdf2"],
  terraform: ["#693acf", "#9d6afb"],
  text: ["#84848a", "#adadb1"],
  typescript: ["#1a85d4", "#69b1ff"],
  vite: ["#a631be", "#d568ea"],
  vscode: ["#1a85d4", "#69b1ff"],
  vue: ["#199f43", "#5ecc71"],
  wasm: ["#693acf", "#9d6afb"],
  webpack: ["#1a85d4", "#69b1ff"],
  yml: ["#d52c36", "#ff6762"],
  zig: ["#d47628", "#ffa359"],
  zip: ["#d47628", "#ffa359"],
}

export function fileIconColorVariables(mode: 0 | 1) {
  return Object.entries(FILE_ICON_COLORS)
    .map(([token, colors]) => `--fs-file-icon-${token}: ${colors[mode]};`)
    .join(" ")
}

// The variables live on :root rather than the component root because the
// filter menus and dialogs portal outside it; the --fs-file-icon-*
// namespace keeps them collision-free. Thumbnail tiles keep a light
// (paper) surface in dark mode, so icons inside them revert to the light
// palette ([data-file-system-on-light]); selected rows sit on the primary
// surface — the opposite of the mode's background — so icons there swap to
// the opposite palette ([data-file-system-on-primary] in the light DOM,
// --fs-selected-color-scheme for the tree's light-dark() colors inside its
// shadow DOM).
export const FILE_ICON_COLOR_CSS = `
:root { ${fileIconColorVariables(0)} --fs-selected-color-scheme: dark; }
.dark { ${fileIconColorVariables(1)} --fs-selected-color-scheme: light; }
.dark [data-file-system-on-light] { ${fileIconColorVariables(0)} }
[data-file-system-on-primary] { ${fileIconColorVariables(1)} }
.dark [data-file-system-on-primary] { ${fileIconColorVariables(0)} }
`

export function FileSystemIconSpriteSheet() {
  return (
    <>
      <span
        aria-hidden="true"
        className="hidden"
        dangerouslySetInnerHTML={{ __html: FILE_ICON_SPRITE_SHEET }}
      />
      <style>{FILE_ICON_COLOR_CSS}</style>
    </>
  )
}

export function FileTypeIcon({
  fileName,
  className,
}: {
  fileName: string
  className?: string
}) {
  const icon = resolveFileIcon("file-tree-icon-file", fileName)

  return (
    <svg
      aria-hidden="true"
      viewBox={icon.viewBox ?? "0 0 16 16"}
      className={cn("shrink-0 text-muted-foreground", className)}
      style={
        icon.token
          ? {
              color: `var(--fs-file-icon-${icon.token}, var(--color-muted-foreground))`,
            }
          : undefined
      }
    >
      <use href={`#${icon.name}`} />
    </svg>
  )
}

export function FileGenericPreview({ file }: { file: FileEntry }) {
  const extension = fileExtension(file.name)

  return (
    <div
      data-file-system-on-light=""
      className="flex size-full flex-col items-center justify-center gap-1.5 bg-white text-neutral-400 dark:bg-neutral-100"
    >
      <FileTypeIcon fileName={file.name} className="size-1/3 min-h-4 min-w-4" />
      {extension ? (
        <span className="text-[min(0.625rem,18cqw)] font-semibold tracking-wide uppercase">
          {extension}
        </span>
      ) : null}
    </div>
  )
}

export function filePreviewUrls(file: FileSystemFileItem) {
  if (file.previewImageUrls?.length) return file.previewImageUrls
  return file.previewImageUrl ? [file.previewImageUrl] : []
}

// Mirrors @pierre/trees' query normalization so the toolbar search filters
// the icon, column, and gallery views exactly like the list view tree:
// trimmed, backslashes to slashes, lowercased, substring match on the path.
export function normalizeSearchQuery(value: string) {
  const trimmed = value.trim()

  if (!trimmed) return ""
  return trimmed.replaceAll("\\", "/").toLowerCase()
}

// Windowed rendering, the approach @pierre/trees uses for the list view:
// with a fixed item stride only the items intersecting the viewport — plus
// `overscan` on each side — are mounted, so views stay flat-cost at
// thousands of entries. The window keeps a one-item margin before
// recomputing (scrolling doesn't re-render per item) and that margin also
// guarantees single-step keyboard moves land on a mounted neighbor.
export function useVirtualWindow({
  count,
  horizontal = false,
  itemStride,
  leadingPx = 0,
  overscan = 8,
  viewportRef,
}: {
  count: number
  horizontal?: boolean
  itemStride: number
  leadingPx?: number
  overscan?: number
  viewportRef: React.RefObject<HTMLDivElement | null>
}) {
  const [window_, setWindow] = React.useState(() => ({
    end: Math.min(count, overscan * 2),
    start: 0,
  }))

  React.useLayoutEffect(() => {
    const viewport = viewportRef.current

    if (!viewport || itemStride <= 0) return

    const update = () => {
      const scrollStart =
        (horizontal ? viewport.scrollLeft : viewport.scrollTop) - leadingPx
      const viewportSize = horizontal
        ? viewport.clientWidth
        : viewport.clientHeight
      const firstVisible = Math.max(0, Math.floor(scrollStart / itemStride))
      const lastVisible = Math.min(
        count,
        Math.ceil((scrollStart + viewportSize) / itemStride)
      )

      setWindow((previous) => {
        if (
          previous.end <= count &&
          previous.start <= Math.max(0, firstVisible - 1) &&
          previous.end >= Math.min(count, lastVisible + 1)
        ) {
          return previous
        }
        return {
          end: Math.min(count, lastVisible + overscan),
          start: Math.max(0, firstVisible - overscan),
        }
      })
    }

    update()
    viewport.addEventListener("scroll", update, { passive: true })

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update)

    observer?.observe(viewport)
    return () => {
      viewport.removeEventListener("scroll", update)
      observer?.disconnect()
    }
  }, [count, horizontal, itemStride, leadingPx, overscan, viewportRef])

  return window_
}

// Scrolls the item at `index` into the viewport when it sits outside it —
// virtualized views need this because off-window items have no DOM node to
// call scrollIntoView on.
export function scrollIndexIntoView({
  horizontal = false,
  index,
  itemSize,
  itemStride,
  leadingPx = 0,
  viewport,
}: {
  horizontal?: boolean
  index: number
  itemSize: number
  itemStride: number
  leadingPx?: number
  viewport: HTMLDivElement | null
}) {
  if (!viewport || index < 0) return

  const start = leadingPx + index * itemStride
  const end = start + itemSize
  const scrollStart = horizontal ? viewport.scrollLeft : viewport.scrollTop
  const viewportSize = horizontal ? viewport.clientWidth : viewport.clientHeight

  let nextScrollStart: number | null = null

  if (start < scrollStart) {
    nextScrollStart = start
  } else if (end > scrollStart + viewportSize) {
    nextScrollStart = end - viewportSize
  }
  if (nextScrollStart === null) return
  if (horizontal) {
    viewport.scrollLeft = nextScrollStart
  } else {
    viewport.scrollTop = nextScrollStart
  }
}

export function FileVisual({
  file,
  className,
  loadPreviewImageUrlAction,
  pageable = false,
  pageUrlCache,
  previewAspectRatio,
  previewClassName,
  previewWidthHint,
  renderFilePreview,
}: {
  file: FileEntry
  className?: string
  loadPreviewImageUrlAction?: (
    file: FileSystemFileItem,
    pageIndex: number
  ) => Promise<string | null>
  /** Show a hover pager over multi-page thumbnails. */
  pageable?: boolean
  /**
   * Shared `"path#pageIndex"` → URL cache so pages fetched by one pager
   * (gallery stage, columns preview) are reused by every other instance.
   */
  pageUrlCache?: Map<string, string>
  previewAspectRatio?: number
  previewClassName?: string
  /** Approximate rendered width in CSS px, forwarded to `renderFilePreview`. */
  previewWidthHint?: number
  renderFilePreview?: (
    file: FileSystemFileItem,
    options?: FileSystemPreviewOptions
  ) => React.ReactNode
}) {
  const t = useTranslations("Upload")
  const previewUrls = filePreviewUrls(file)
  const canLoadLazily = pageable && Boolean(loadPreviewImageUrlAction)
  const totalPages = Math.max(
    previewUrls.length,
    canLoadLazily ? (file.previewPageCount ?? 0) : 0
  )
  const [pageIndex, setPageIndex] = React.useState(0)
  const [lazyPageUrls, setLazyPageUrls] = React.useState<
    Record<number, string>
  >({})
  const clampedPageIndex = Math.min(pageIndex, Math.max(totalPages - 1, 0))
  const previewUrl =
    previewUrls[clampedPageIndex] ??
    lazyPageUrls[clampedPageIndex] ??
    pageUrlCache?.get(`${file.path}#${clampedPageIndex}`) ??
    null
  const resolvedAspectRatio = file.previewAspectRatio ?? previewAspectRatio
  const isLazyPagePending =
    canLoadLazily && !previewUrl && clampedPageIndex < totalPages

  const fileRef = React.useRef(file)

  React.useEffect(() => {
    fileRef.current = file
  })

  React.useEffect(() => {
    setPageIndex(0)
    setLazyPageUrls({})
  }, [file.path])

  // Keyed by path (not object identity) so manifest churn doesn't re-request
  // the page already being loaded.
  React.useEffect(() => {
    if (!isLazyPagePending || !loadPreviewImageUrlAction) return

    let isCurrent = true

    void loadPreviewImageUrlAction(fileRef.current, clampedPageIndex)
      .then((url) => {
        // Cache even when stale (page flipped away mid-load): the fetch is
        // done, so let the next visit use it.
        if (url) pageUrlCache?.set(`${file.path}#${clampedPageIndex}`, url)
        if (isCurrent && url) {
          setLazyPageUrls((previous) => ({
            ...previous,
            [clampedPageIndex]: url,
          }))
        }
      })
      .catch(() => {})

    return () => {
      isCurrent = false
    }
  }, [
    clampedPageIndex,
    file.path,
    isLazyPagePending,
    loadPreviewImageUrlAction,
    pageUrlCache,
  ])

  const customPreview =
    !previewUrl && !isLazyPagePending
      ? renderFilePreview?.(file, { widthHint: previewWidthHint })
      : null
  const showPager = pageable && totalPages > 1
  const thumbnail = (
    <FileThumbnail
      file={{ name: file.name, type: file.contentType ?? "" }}
      className={cn("@container", !showPager && className)}
      previewAspectRatio={resolvedAspectRatio}
      previewClassName={cn("bg-white dark:bg-neutral-100", previewClassName)}
      previewImageUrl={previewUrl ?? undefined}
      isLoading={isLazyPagePending}
      previewContent={
        previewUrl || isLazyPagePending
          ? undefined
          : (customPreview ?? <FileGenericPreview file={file} />)
      }
    />
  )

  if (!showPager) return thumbnail

  return (
    <div className={cn("group/pager relative", className)}>
      {thumbnail}
      <div className="absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-1 opacity-0 transition-opacity group-focus-within/pager:opacity-100 group-hover/pager:opacity-100">
        <button
          type="button"
          aria-label={t("previousPage")}
          tabIndex={-1}
          disabled={clampedPageIndex === 0}
          onClick={(event) => {
            event.stopPropagation()
            setPageIndex((previous) => Math.max(0, previous - 1))
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          className="flex size-6 items-center justify-center rounded-md bg-background/80 text-foreground shadow-xs backdrop-blur-sm transition-colors outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
        >
          <AppIcon icon={ArrowLeft01Icon} className="size-3.5" />
        </button>
        <span className="rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums shadow-xs backdrop-blur-sm">
          {clampedPageIndex + 1}/{totalPages}
        </span>
        <button
          type="button"
          aria-label={t("nextPage")}
          tabIndex={-1}
          disabled={clampedPageIndex >= totalPages - 1}
          onClick={(event) => {
            event.stopPropagation()
            setPageIndex((previous) => Math.min(totalPages - 1, previous + 1))
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          className="flex size-6 items-center justify-center rounded-md bg-background/80 text-foreground shadow-xs backdrop-blur-sm transition-colors outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
        >
          <AppIcon icon={ArrowRight01Icon} className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
