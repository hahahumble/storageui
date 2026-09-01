import * as React from "react"
import { DragDropProvider, DragOverlay, PointerSensor } from "@dnd-kit/react"
import { useTranslations } from "next-intl"
import { createPortal } from "react-dom"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileSystemDateRangeDialog } from "@/components/explorer/dialogs/date-range-dialog"
import {
  DeleteEntriesDialog,
  InfoEntryDialog,
  MoveEntriesDialog,
  NewFolderDialog,
  RenameEntryDialog,
} from "@/components/explorer/dialogs/entry-dialogs"
import type {
  FileSystemDateFilterType,
  FileTypeFilterOption,
  RenameController,
} from "@/components/explorer/internals"
import {
  buildFileSystemIndex,
  compareEntriesBySort,
  createFileSystemFilterId,
  DATE_FILTER_PRESETS,
  DEFAULT_SORT,
  defaultSortDirection,
  FILE_TYPE_FILTER_GROUPS,
  fileMatchesFilter,
  FileSystemFolderGlyph,
  FileSystemIconSpriteSheet,
  fileTypeFilterGroup,
  FileTypeIcon,
  filterOperatorChoices,
  formatEntryName,
  IPAD_MIN_WIDTH,
  isCustomDateRangeValue,
  isHiddenPath,
  MIME_TYPE_LABELS,
  mimeTypeForFile,
  normalizeFolderPath,
  normalizeSearchQuery,
  pathName,
  pathParent,
  RenameContext,
  ShowFileExtensionsContext,
  SORT_OPTIONS,
  VIEWER_DIALOG_CLASSNAMES,
  viewerKindForFile,
} from "@/components/explorer/internals"
import type {
  FileEntry,
  FileSystemEntry,
  FileSystemFileItem,
  FileSystemFilter,
  FileSystemFilterOperator,
  FileSystemItem,
  FileSystemProps,
  FileSystemSortKey,
  FileSystemSortState,
  FileSystemView,
  FileSystemViewerKind,
  FileSystemViewProps,
  SelectionModifiers,
} from "@/components/explorer/types"
import { FileSystemColumnsView } from "@/components/explorer/views/columns-view"
import {
  FileSystemGalleryStage,
  FileSystemGalleryView,
  GALLERY_STAGE_ATTACHED_COUNT,
  GALLERY_STAGE_POOL_SIZE,
} from "@/components/explorer/views/gallery-view"
import { FileSystemIconsView } from "@/components/explorer/views/icons-view"
import { FileSystemListView } from "@/components/explorer/views/list-view"
import { FileSystemEmptyState } from "@/components/explorer/views/shared"
import {
  AppIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUpDownIcon,
  Calendar03Icon,
  Cancel01Icon,
  Delete02Icon,
  Download01Icon,
  Edit02Icon,
  ExternalLinkIcon,
  FavouriteIcon,
  File01Icon,
  FilterIcon,
  Folder01Icon,
  GalleryThumbnailsIcon,
  GridViewIcon,
  InformationCircleIcon,
  LayoutThreeColumnIcon,
  LeftToRightListBulletIcon,
  MoveIcon,
  RotateClockwiseIcon,
  Search01Icon,
  Tick02Icon,
} from "@/components/foundations/icons"

export {
  FileSystemIconSpriteSheet,
  FileTypeIcon,
} from "@/components/explorer/internals"

export type {
  FileSystemFileItem,
  FileSystemFilter,
  FileSystemFilterOperator,
  FileSystemFilterType,
  FileSystemFolderItem,
  FileSystemItem,
  FileSystemLoadChildrenArgs,
  FileSystemLoadChildrenResult,
  FileSystemProps,
  FileSystemSortKey,
  FileSystemSortState,
  FileSystemView,
  FileSystemViewerKind,
} from "@/components/explorer/types"

const VIEW_OPTIONS: Array<{
  icon: React.ComponentProps<typeof AppIcon>["icon"]
  labelKey: string
  value: FileSystemView
}> = [
  { icon: GridViewIcon, labelKey: "viewIcons", value: "icons" },
  { icon: LeftToRightListBulletIcon, labelKey: "viewList", value: "list" },
  { icon: LayoutThreeColumnIcon, labelKey: "viewColumns", value: "columns" },
  { icon: GalleryThumbnailsIcon, labelKey: "viewGallery", value: "gallery" },
]

// Stable enum values → catalog keys for the constant-driven labels rendered
// across the toolbar and filter UI (the constants live in internals.tsx).
const SORT_LABEL_KEYS: Record<string, string> = {
  name: "sortName",
  kind: "sortKind",
  createdAt: "sortCreated",
  updatedAt: "sortUpdated",
  size: "sortSize",
}
const SORT_TRIGGER_KEYS: Record<string, string> = {
  name: "sortTriggerName",
  kind: "sortTriggerKind",
  createdAt: "sortTriggerCreated",
  updatedAt: "sortTriggerUpdated",
  size: "sortTriggerSize",
}
const FILTER_TYPE_KEYS: Record<string, string> = {
  dateCreated: "filterDateCreated",
  dateModified: "filterDateModified",
  fileType: "filterFileType",
}
const OPERATOR_KEYS: Record<string, string> = {
  after: "opAfter",
  before: "opBefore",
  "in-range": "opInRange",
  is: "opIs",
  "is-any-of": "opIsAnyOf",
  "is-not": "opIsNot",
  "not-in-range": "opNotInRange",
}
const GROUP_KEYS: Record<string, string> = {
  Documents: "groupDocuments",
  Spreadsheets: "groupSpreadsheets",
  Images: "groupImages",
  Code: "groupCode",
  Text: "groupText",
  "Archives & binary": "groupBinary",
}
const DATE_PRESET_KEYS: Record<string, string> = {
  "1 day ago": "preset1Day",
  "3 days ago": "preset3Days",
  "1 week ago": "preset1Week",
  "1 month ago": "preset1Month",
  "3 months ago": "preset3Months",
  "6 months ago": "preset6Months",
  "1 year ago": "preset1Year",
}

const EMPTY_SELECTION: ReadonlySet<string> = new Set()

// Validate a move of `targets` into `destination` (a "prefix/" or "" root).
// Returns a translation key (+ values) describing the problem, or null when the
// move is allowed. The caller translates it (this helper can't use hooks).
type MoveError = { key: string; values?: Record<string, string> }

function validateMove(
  targets: FileSystemEntry[],
  destination: string,
  files: ReadonlyMap<string, unknown>,
  folders: ReadonlyMap<string, unknown>
): MoveError | null {
  if (targets.length === 0) return { key: "moveNothing" }
  if (targets.every((target) => target.parentPath === destination)) {
    return { key: "moveAlreadyHere" }
  }
  for (const target of targets) {
    if (
      target.kind === "folder" &&
      (destination === target.path || destination.startsWith(target.path))
    ) {
      return { key: "moveIntoItself" }
    }
    const destFilePath = `${destination}${target.name}`
    if (
      files.has(destFilePath) ||
      folders.has(normalizeFolderPath(destFilePath))
    ) {
      return targets.length > 1
        ? { key: "moveNameExistsNamed", values: { name: target.name } }
        : { key: "moveNameExists" }
    }
  }
  return null
}

// Follows the cursor during a drag. For a multi-selection it shows a stacked
// card with a count badge, so several files visibly drag together.
function FileSystemDragPreview({
  entry,
  count,
  showFileExtensions,
}: {
  entry: FileSystemEntry
  count: number
  showFileExtensions: boolean
}) {
  return (
    <div className="pointer-events-none relative w-fit">
      {count >= 3 ? (
        // 3+ items: a small stack behind the front card.
        <>
          <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-lg border bg-background shadow-xs" />
          <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg border bg-background shadow-xs" />
        </>
      ) : count === 2 ? (
        // Exactly two items: just two cards.
        <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-lg border bg-background shadow-xs" />
      ) : null}
      <div className="relative flex items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-xs">
        {entry.kind === "folder" ? (
          <FileSystemFolderGlyph className="h-5 w-auto shrink-0" />
        ) : (
          <FileTypeIcon fileName={entry.name} className="size-5 shrink-0" />
        )}
        <span className="max-w-56 truncate text-sm font-medium">
          {formatEntryName(entry, showFileExtensions)}
        </span>
        {count > 1 ? (
          <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground tabular-nums">
            {count}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function FileSystem({
  items,
  isLoading = false,
  className,
  title = "Files",
  titleBadge,
  headerLeading,
  defaultView = "icons",
  view: viewProp,
  onViewChangeAction,
  defaultSort = DEFAULT_SORT,
  sort: sortProp,
  onSortChangeAction,
  defaultFilters = [],
  filters: filtersProp,
  onFiltersChangeAction,
  showFileExtensions = true,
  defaultShowHiddenFiles = false,
  showHiddenFiles: showHiddenFilesProp,
  defaultPath = "",
  onPathChangeAction,
  onSelectionChange,
  onCreateFolderAction,
  onDownloadEntry,
  onDeleteEntry,
  onDeleteEntries,
  onRenameEntryAction,
  onMoveEntry,
  onMoveEntries,
  isStarred,
  onToggleStar,
  onFileOpen,
  getFileUrl,
  loadChildren,
  loadPreviewImageUrlAction,
  renderFilePreview,
  reloadToken,
}: FileSystemProps) {
  const t = useTranslations("Explorer")
  const [internalView, setInternalView] = React.useState(defaultView)
  const view = viewProp ?? internalView
  const setView = React.useCallback(
    (nextView: FileSystemView) => {
      setInternalView(nextView)
      onViewChangeAction?.(nextView)
    },
    [onViewChangeAction]
  )

  const [loadedItems, setLoadedItems] = React.useState<FileSystemItem[]>([])
  const allItems = React.useMemo(
    () => (loadedItems.length ? [...items, ...loadedItems] : items),
    [items, loadedItems]
  )
  // Controlled by the caller (the app reads it from Settings) with no in-view
  // toggle, so there is nothing to hold in local state.
  const showHiddenFiles = showHiddenFilesProp ?? defaultShowHiddenFiles
  // Paths optimistically hidden while a move is in flight, so a drag-drop (or a
  // dialog move) removes the entries from the source folder instantly instead
  // of waiting seconds for the server move + re-list.
  const [optimisticallyMovedPaths, setOptimisticallyMovedPaths] =
    React.useState<ReadonlySet<string>>(EMPTY_SELECTION)
  const visibleItems = React.useMemo(() => {
    let next = allItems
    if (optimisticallyMovedPaths.size > 0) {
      next = next.filter(
        (item) =>
          ![...optimisticallyMovedPaths].some(
            (path) => item.path === path || item.path.startsWith(path)
          )
      )
    }
    if (!showHiddenFiles) {
      next = next.filter((item) => !isHiddenPath(item.path))
    }
    return next
  }, [allItems, optimisticallyMovedPaths, showHiddenFiles])
  const index = React.useMemo(
    () => buildFileSystemIndex(visibleItems),
    [visibleItems]
  )
  // Stop hiding a moved path once the real listing no longer contains it (the
  // server move + re-list landed) — no flicker, since hiding persists until the
  // data catches up. Failures clear the path explicitly (see executeMove).
  React.useEffect(() => {
    setOptimisticallyMovedPaths((previous) => {
      if (previous.size === 0) return previous
      const next = new Set<string>()
      for (const path of previous) {
        if (
          allItems.some(
            (item) => item.path === path || item.path.startsWith(path)
          )
        ) {
          next.add(path)
        }
      }
      return next.size === previous.size ? previous : next
    })
  }, [allItems])

  const [history, setHistory] = React.useState(() => ({
    index: 0,
    stack: [normalizeFolderPath(defaultPath)],
  }))
  const currentPath = history.stack[history.index] ?? ""
  const canGoBack = history.index > 0
  const canGoForward = history.index < history.stack.length - 1

  // `selectedPath` is the anchor (drives the gallery/columns detail pane and
  // range selection); `selectedPaths` is the full multi-selection set.
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null)
  const [selectedPaths, setSelectedPaths] =
    React.useState<ReadonlySet<string>>(EMPTY_SELECTION)
  const selectedEntry = React.useMemo(() => {
    if (selectedPath === null) return null

    return (
      index.files.get(selectedPath) ?? index.folders.get(selectedPath) ?? null
    )
  }, [index, selectedPath])

  const [searchInput, setSearchInput] = React.useState("")
  const searchInputRef = React.useRef<HTMLInputElement | null>(null)
  const [isSearchExpanded, setIsSearchExpanded] = React.useState(false)
  const searchQuery = normalizeSearchQuery(searchInput)
  const isSearching = searchQuery.length > 0

  const [internalSort, setInternalSort] = React.useState(defaultSort)
  const sort = sortProp ?? internalSort
  const setSort = React.useCallback(
    (update: React.SetStateAction<FileSystemSortState>) => {
      const next = typeof update === "function" ? update(sort) : update

      if (sortProp === undefined) setInternalSort(next)
      onSortChangeAction?.(next)
    },
    [onSortChangeAction, sort, sortProp]
  )
  const [internalFilters, setInternalFilters] =
    React.useState<FileSystemFilter[]>(defaultFilters)
  const filters = filtersProp ?? internalFilters
  const setFilters = React.useCallback(
    (update: React.SetStateAction<FileSystemFilter[]>) => {
      const next = typeof update === "function" ? update(filters) : update

      if (filtersProp === undefined) setInternalFilters(next)
      onFiltersChangeAction?.(next)
    },
    [filters, filtersProp, onFiltersChangeAction]
  )
  const hasActiveFilters = filters.length > 0

  // Files must pass every active filter; folders stay visible through
  // matching descendants, so the predicate only ever sees files.
  const fileFilter = React.useMemo(() => {
    if (filters.length === 0) return null
    return (file: FileEntry) =>
      filters.every((filter) => fileMatchesFilter(file, filter))
  }, [filters])

  // Paths that stay visible while searching or filtering: every file whose
  // currentPath-relative path contains the query — the list view tree's
  // hide-non-matches semantics — and that passes the filters, plus the
  // ancestor folders leading to it. Folder names participate in search
  // matches only when no filters are active; with filters, a folder is only
  // as visible as the files inside it.
  const visiblePaths = React.useMemo(() => {
    if (!isSearching && !fileFilter) return null

    const visible = new Set<string>()
    const markVisible = (path: string) => {
      while (path && path !== currentPath && !visible.has(path)) {
        visible.add(path)
        path = pathParent(path)
      }
    }
    const matchesQuery = (path: string) =>
      !isSearching ||
      path.slice(currentPath.length).toLowerCase().includes(searchQuery)

    for (const [path, file] of index.files) {
      if (path === currentPath) continue
      if (currentPath && !path.startsWith(currentPath)) continue
      if (!matchesQuery(path)) continue
      if (fileFilter && !fileFilter(file)) continue
      markVisible(path)
    }
    if (!fileFilter) {
      for (const path of index.folders.keys()) {
        if (path === currentPath) continue
        if (currentPath && !path.startsWith(currentPath)) continue
        if (matchesQuery(path)) markVisible(path)
      }
    }
    return visible
  }, [currentPath, fileFilter, index, isSearching, searchQuery])

  const visibleIndex = React.useMemo(() => {
    if (!visiblePaths) return index

    const children = new Map<string, FileSystemEntry[]>()

    for (const [parentPath, parentChildren] of index.children) {
      const visibleChildren = parentChildren.filter((entry) =>
        visiblePaths.has(entry.path)
      )

      if (visibleChildren.length) children.set(parentPath, visibleChildren)
    }
    return { ...index, children }
  }, [index, visiblePaths])

  // Children re-sorted per the active sort; the default (name ascending)
  // reuses the index's pre-sorted arrays untouched.
  const sortedIndex = React.useMemo(() => {
    if (
      sort.key === DEFAULT_SORT.key &&
      sort.direction === DEFAULT_SORT.direction
    ) {
      return visibleIndex
    }

    const children = new Map<string, FileSystemEntry[]>()

    for (const [parentPath, parentChildren] of visibleIndex.children) {
      children.set(
        parentPath,
        [...parentChildren].sort((left, right) =>
          compareEntriesBySort(left, right, sort)
        )
      )
    }
    return { ...visibleIndex, children }
  }, [sort, visibleIndex])

  // The refs mirror the state so re-selecting the same entry (e.g. the
  // pointerdown + click pair the columns view emits per press) stays a
  // no-op without widening the callbacks' dependencies. `currentEntriesRef`
  // gives the ordered current folder, and `sortedChildrenRef` the ordered
  // siblings at any depth, for Shift range selection.
  const selectedPathRef = React.useRef<string | null>(null)
  const selectedPathsRef = React.useRef<ReadonlySet<string>>(EMPTY_SELECTION)
  const currentEntriesRef = React.useRef<FileSystemEntry[]>([])
  const sortedChildrenRef = React.useRef<Map<string, FileSystemEntry[]>>(
    new Map()
  )

  // Drop selections whose entries were hidden (or removed) so the footer
  // count and context actions can't reference stale paths.
  React.useEffect(() => {
    setSelectedPath((previous) => {
      if (
        previous !== null &&
        !index.files.has(previous) &&
        !index.folders.has(normalizeFolderPath(previous))
      ) {
        selectedPathRef.current = null
        return null
      }
      return previous
    })
    setSelectedPaths((previous) => {
      if (previous.size === 0) return previous
      const next = new Set(
        [...previous].filter(
          (path) =>
            index.files.has(path) ||
            index.folders.has(normalizeFolderPath(path))
        )
      )
      if (next.size === previous.size) return previous
      selectedPathsRef.current = next
      return next
    })
  }, [index])

  const applySelection = React.useCallback(
    (
      paths: ReadonlySet<string>,
      anchor: string | null,
      anchorEntry: FileSystemEntry | null
    ) => {
      selectedPathsRef.current = paths
      selectedPathRef.current = anchor
      setSelectedPaths(paths)
      setSelectedPath(anchor)
      onSelectionChange?.(anchorEntry)
    },
    [onSelectionChange]
  )

  const selectEntry = React.useCallback(
    (entry: FileSystemEntry | null, modifiers?: SelectionModifiers) => {
      const path = entry?.path ?? null

      // Cmd/Ctrl-click: toggle this entry in/out of the selection.
      if (entry && modifiers?.toggle) {
        const next = new Set(selectedPathsRef.current)
        if (next.has(entry.path)) next.delete(entry.path)
        else next.add(entry.path)

        const anchor = next.has(entry.path)
          ? entry.path
          : selectedPathRef.current && next.has(selectedPathRef.current)
            ? selectedPathRef.current
            : next.size
              ? Array.from(next)[next.size - 1]
              : null
        applySelection(next, anchor, anchor === entry.path ? entry : null)
        return
      }

      // Shift-click: select the range from the anchor to this entry. Use the
      // clicked entry's ordered siblings (works at any depth, e.g. a deep
      // column), falling back to the current folder.
      if (entry && modifiers?.range && selectedPathRef.current) {
        const entries =
          sortedChildrenRef.current.get(entry.parentPath) ??
          currentEntriesRef.current
        const from = entries.findIndex(
          (candidate) => candidate.path === selectedPathRef.current
        )
        const to = entries.findIndex(
          (candidate) => candidate.path === entry.path
        )
        if (from !== -1 && to !== -1) {
          const [lo, hi] = from <= to ? [from, to] : [to, from]
          const next = new Set(
            entries.slice(lo, hi + 1).map((candidate) => candidate.path)
          )
          // Keep the anchor; focus moves to the clicked entry.
          applySelection(next, entry.path, entry)
          return
        }
      }

      // Plain click: collapse to a single entry.
      if (
        selectedPathRef.current === path &&
        selectedPathsRef.current.size <= 1
      ) {
        return
      }
      applySelection(path ? new Set([path]) : EMPTY_SELECTION, path, entry)
    },
    [applySelection]
  )

  // Replace the whole selection at once. The list view's tree owns its own
  // selection model (including Cmd/Shift handling) and reports the full set.
  const selectMany = React.useCallback(
    (entries: FileSystemEntry[]) => {
      if (entries.length === 0) {
        applySelection(EMPTY_SELECTION, null, null)
        return
      }
      const anchorEntry = entries[entries.length - 1]
      applySelection(
        new Set(entries.map((entry) => entry.path)),
        anchorEntry.path,
        anchorEntry
      )
    },
    [applySelection]
  )

  // A query or filter change can hide selected entries out from under the
  // views; drop any that are no longer visible.
  React.useEffect(() => {
    if (!visiblePaths) return
    const current = selectedPathsRef.current
    if (current.size === 0) return

    let changed = false
    const next = new Set<string>()
    for (const path of current) {
      if (visiblePaths.has(path)) next.add(path)
      else changed = true
    }
    if (!changed) return

    const anchor =
      selectedPathRef.current && next.has(selectedPathRef.current)
        ? selectedPathRef.current
        : next.size
          ? Array.from(next)[next.size - 1]
          : null
    const anchorEntry = anchor
      ? (index.files.get(anchor) ?? index.folders.get(anchor) ?? null)
      : null
    applySelection(next, anchor, anchorEntry)
  }, [applySelection, index, visiblePaths])

  const applySortKey = React.useCallback(
    (key: FileSystemSortKey) => {
      setSort((previous) =>
        previous.key === key
          ? previous
          : { direction: defaultSortDirection(key), key }
      )
    },
    [setSort]
  )

  // Column headers toggle the direction when the column is already active,
  // like Finder.
  const toggleSortColumn = React.useCallback(
    (key: FileSystemSortKey) => {
      setSort((previous) =>
        previous.key === key
          ? { direction: previous.direction === "asc" ? "desc" : "asc", key }
          : { direction: defaultSortDirection(key), key }
      )
    },
    [setSort]
  )

  // Distinct MIME types across the loaded manifest, labeled for the filter
  // menu; the first file seen per type lends its name to the option icon.
  const fileTypeOptions = React.useMemo(() => {
    const byMime = new Map<string, FileTypeFilterOption>()

    for (const file of index.files.values()) {
      const mime = mimeTypeForFile(file)

      if (!byMime.has(mime)) {
        // The leading-dot check keeps dotfiles (.gitignore) whole.
        const dotIndex = file.name.lastIndexOf(".")
        const extension =
          dotIndex > 0 ? file.name.slice(dotIndex + 1).toLowerCase() : ""

        byMime.set(mime, {
          group: fileTypeFilterGroup(mime),
          // A synthesized generic name, so files with branded icons
          // (biome.json, next.config.ts, CLAUDE.md, …) don't lend them to
          // the whole type; extensionless names keep their own icon
          // (Dockerfile, Makefile).
          iconFileName: extension ? `file.${extension}` : file.name,
          label: MIME_TYPE_LABELS[mime] ?? mime,
          mime,
        })
      }
    }
    return [...byMime.values()].sort((left, right) =>
      left.label.localeCompare(right.label)
    )
  }, [index])

  const [dateRangeDialog, setDateRangeDialog] = React.useState<{
    initialRange?: { from: Date; to: Date }
    type: FileSystemDateFilterType
  } | null>(null)

  const toggleFileTypeFilterValue = React.useCallback(
    (mime: string, checked: boolean) => {
      const id = createFileSystemFilterId()

      setFilters((previous) => {
        const existing = previous.find((filter) => filter.type === "fileType")

        if (!existing) {
          if (!checked) return previous
          return [
            ...previous,
            {
              id,
              operator: "is" as const,
              type: "fileType" as const,
              value: [mime],
            },
          ]
        }

        const value = checked
          ? [...new Set([...existing.value, mime])]
          : existing.value.filter((entry) => entry !== mime)

        if (value.length === 0) {
          return previous.filter((filter) => filter !== existing)
        }

        // "is" and "is any of" track the value count; "is not" is unaffected.
        const operator =
          existing.operator === "is" || existing.operator === "is-any-of"
            ? value.length > 1
              ? ("is-any-of" as const)
              : ("is" as const)
            : existing.operator

        return previous.map((filter) =>
          filter === existing ? { ...filter, operator, value } : filter
        )
      })
    },
    [setFilters]
  )

  const setDatePresetFilter = React.useCallback(
    (type: FileSystemDateFilterType, preset: string) => {
      const id = createFileSystemFilterId()

      setFilters((previous) => [
        ...previous.filter((filter) => filter.type !== type),
        { id, operator: "after", type, value: [preset] },
      ])
    },
    [setFilters]
  )

  // Editing an existing custom range seeds the dialog with its bounds.
  const openDateRangeDialog = React.useCallback(
    (type: FileSystemDateFilterType) => {
      const existing = filters.find((filter) => filter.type === type)

      setDateRangeDialog({
        initialRange:
          existing && isCustomDateRangeValue(existing.value)
            ? {
                from: new Date(existing.value[0]),
                to: new Date(existing.value[1]),
              }
            : undefined,
        type,
      })
    },
    [filters]
  )

  const applyCustomDateRange = React.useCallback(
    (type: FileSystemDateFilterType, from: Date, to: Date) => {
      const id = createFileSystemFilterId()

      setFilters((previous) => {
        const existing = previous.find((filter) => filter.type === type)

        return [
          ...previous.filter((filter) => filter.type !== type),
          {
            id,
            operator:
              existing?.operator === "not-in-range"
                ? ("not-in-range" as const)
                : ("in-range" as const),
            type,
            value: [from.toISOString(), to.toISOString()],
          },
        ]
      })
    },
    [setFilters]
  )

  // Below iPad width the view switcher collapses into a select and the sort
  // select drops its label; below 560px the search input collapses into a
  // popover, and below 360px the folder name is dropped too.
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const [headerLayout, setHeaderLayout] = React.useState<
    "full" | "compact" | "minimal"
  >("full")
  const [isBelowIpadWidth, setIsBelowIpadWidth] = React.useState(false)

  React.useEffect(() => {
    const root = rootRef.current

    if (!root || typeof ResizeObserver === "undefined") return

    const applyWidth = (width: number | undefined) => {
      if (width === undefined) return

      setHeaderLayout(
        width < 360 ? "minimal" : width < 560 ? "compact" : "full"
      )
      setIsBelowIpadWidth(width < IPAD_MIN_WIDTH)
    }
    const observer = new ResizeObserver((observerEntries) =>
      applyWidth(observerEntries[0]?.contentRect.width)
    )

    // Measure synchronously so the first painted layout is already correct;
    // the observer then tracks resizes.
    applyWidth(root.clientWidth)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  const requestedFoldersRef = React.useRef(new Set<string>())
  const [loadingFolders, setLoadingFolders] = React.useState<Set<string>>(
    () => new Set()
  )
  const ensureChildren = React.useCallback(
    (folderPath: string) => {
      if (!loadChildren) return

      const folder = index.folders.get(folderPath)

      if (!folder?.hasChildren) return
      if (index.children.get(folderPath)?.length) return
      if (requestedFoldersRef.current.has(folderPath)) return

      requestedFoldersRef.current.add(folderPath)
      setLoadingFolders((previous) => new Set(previous).add(folderPath))

      void (async () => {
        try {
          let cursor: string | null = null

          do {
            const result = await loadChildren({ cursor, path: folderPath })

            if (result.items.length) {
              setLoadedItems((previous) => [...previous, ...result.items])
            }
            cursor = result.nextCursor ?? null
          } while (cursor)
        } catch {
          requestedFoldersRef.current.delete(folderPath)
        } finally {
          setLoadingFolders((previous) => {
            const next = new Set(previous)

            next.delete(folderPath)
            return next
          })
        }
      })()
    },
    [index, loadChildren]
  )

  // Re-fetch a folder's children in the background and swap them in atomically,
  // so the existing listing stays on screen (no empty "Loading…" flash) until
  // the fresh entries arrive. Used by `reloadToken` after external mutations.
  const refetchFolder = React.useCallback(
    async (folderPath: string) => {
      // The root listing comes from `items`, not `loadChildren`; the consumer
      // refreshes it directly.
      if (!loadChildren || !folderPath) return

      setLoadingFolders((previous) => new Set(previous).add(folderPath))
      try {
        const collected: FileSystemItem[] = []
        let cursor: string | null = null

        do {
          const result = await loadChildren({ cursor, path: folderPath })

          collected.push(...result.items)
          cursor = result.nextCursor ?? null
        } while (cursor)

        requestedFoldersRef.current.add(folderPath)
        setLoadedItems((previous) => {
          // Replace this folder's children (and any deeper, now-stale ones)
          // with the fresh listing in a single update.
          const kept = previous.filter(
            (item) =>
              !(item.path !== folderPath && item.path.startsWith(folderPath))
          )
          return [...kept, ...collected]
        })
      } catch {
        // Keep the stale listing on failure.
      } finally {
        setLoadingFolders((previous) => {
          const next = new Set(previous)

          next.delete(folderPath)
          return next
        })
      }
    },
    [loadChildren]
  )

  const navigateTo = React.useCallback(
    (folderPath: string) => {
      const path = normalizeFolderPath(folderPath)

      setHistory((previous) => {
        if (previous.stack[previous.index] === path) return previous

        const stack = [...previous.stack.slice(0, previous.index + 1), path]

        return { index: stack.length - 1, stack }
      })
      // Navigation exits search, like Finder.
      setSearchInput("")
      selectEntry(null)
      ensureChildren(path)
    },
    [ensureChildren, selectEntry]
  )

  React.useEffect(() => {
    ensureChildren(currentPath)
  }, [currentPath, ensureChildren])

  // A change in `reloadToken` re-lists the current folder after an external
  // mutation. The refetch runs in the background and swaps the entries in
  // atomically, so there's no remount (Back / Forward survive) and no empty
  // "Loading…" flash — the old listing stays until the fresh one lands. The
  // root folder re-lists from `items`, which the consumer refreshes too.
  const reloadTokenRef = React.useRef(reloadToken)
  React.useEffect(() => {
    if (reloadTokenRef.current === reloadToken) return
    reloadTokenRef.current = reloadToken
    void refetchFolder(currentPath)
  }, [reloadToken, currentPath, refetchFolder])

  // Notify the parent of the visible folder (mount + every navigation), so it
  // can target uploads/drops at the current prefix without owning navigation.
  const onPathChangeActionRef = React.useRef(onPathChangeAction)
  React.useEffect(() => {
    onPathChangeActionRef.current = onPathChangeAction
  }, [onPathChangeAction])
  React.useEffect(() => {
    onPathChangeActionRef.current?.(currentPath)
  }, [currentPath])

  // Navigation unmounts the focused row, dropping focus to <body> and killing
  // the ⌘ shortcuts; reclaim focus onto the component root when that happens.
  const previousPathRef = React.useRef(currentPath)

  React.useEffect(() => {
    if (previousPathRef.current === currentPath) {
      return
    }

    previousPathRef.current = currentPath
    const root = rootRef.current

    if (root && document.activeElement === document.body) {
      root.focus({ preventScroll: true })
    }
  }, [currentPath])

  const [openedFile, setOpenedFile] = React.useState<{
    file: FileEntry
    kind: FileSystemViewerKind
    url: string
  } | null>(null)
  const [contextMenuEntry, setContextMenuEntry] =
    React.useState<FileSystemEntry | null>(null)
  // The entry whose details are shown in the Info dialog.
  const [infoTarget, setInfoTarget] = React.useState<FileSystemEntry | null>(
    null
  )
  const [deleteTargets, setDeleteTargets] = React.useState<FileSystemEntry[]>(
    []
  )
  const [deleteEntryError, setDeleteEntryError] = React.useState<string | null>(
    null
  )
  const [isDeletingEntry, setDeletingEntry] = React.useState(false)
  // Per-item progress for a bulk delete/move, shown as a bar in the dialog.
  const [bulkProgress, setBulkProgress] = React.useState<{
    done: number
    total: number
  } | null>(null)
  const [renameEntryTarget, setRenameEntryTarget] =
    React.useState<FileSystemEntry | null>(null)
  const [renameEntryName, setRenameEntryName] = React.useState("")
  const [renameEntryError, setRenameEntryError] = React.useState<string | null>(
    null
  )
  // Paths whose background rename (move + re-list) is still in flight; the
  // views show a spinner on these so the save is visible after the inline
  // editor closes.
  const [renamingPaths, setRenamingPaths] = React.useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [moveTargets, setMoveTargets] = React.useState<FileSystemEntry[]>([])
  const [moveEntryError, setMoveEntryError] = React.useState<string | null>(
    null
  )
  const [isMovingEntry, setMovingEntry] = React.useState(false)
  const [isNewFolderOpen, setNewFolderOpen] = React.useState(false)
  const [newFolderName, setNewFolderName] = React.useState("")
  const [newFolderError, setNewFolderError] = React.useState<string | null>(
    null
  )
  const [isCreatingFolder, setCreatingFolder] = React.useState(false)

  // Component-lifetime caches shared by every view and the open dialog:
  // resolved (e.g. presigned) URLs keyed by path, and lazily loaded page
  // thumbnails keyed by `"path#pageIndex"`. Each resolution happens once no
  // matter how often the user revisits a file or switches views; stable
  // URLs also keep the browser's HTTP cache valid for fetched content.
  // Lazy state (never set) rather than refs: the Maps are passed down
  // during render, which the rules of React disallow for ref reads.
  const [resolvedUrlCache] = React.useState(() => new Map<string, string>())
  const [pageUrlCache] = React.useState(() => new Map<string, string>())

  // The keep-alive preview pool. Recently shown documents stay mounted so
  // returning to one — in the gallery stage or the viewer dialog — skips
  // the download and parse work instead of repeating it behind a spinner.
  // Each pooled path renders through a portal into a stable detached <div>
  // created once per path and never swapped (React remounts a portal's
  // children when its container changes); a layout effect reparents that
  // div into whichever host currently shows the file: the gallery's stage
  // wrapper or the open dialog. Imperative appendChild keeps the mounted
  // viewer (and its parsed document) alive across every move. Pooled paths
  // without a current host stay mounted but DETACHED from the DOM — a
  // detached subtree costs no layout, paint, or style-recalc work, so idle
  // pool members never slow down interactions in the visible viewer.
  const [stagePool, setStagePool] = React.useState<string[]>([])
  const [stageRecency] = React.useState(() => new Map<string, number>())
  const stageClockRef = React.useRef(0)
  const [stageContainers] = React.useState(
    () => new Map<string, HTMLDivElement>()
  )
  const [stageHosts] = React.useState(() => new Map<string, HTMLElement>())
  const [, bumpStageHosts] = React.useState(0)
  // Bumped on every admission so the attach set recomputes when recency
  // changes without a pool membership change.
  const [stageVersion, setStageVersion] = React.useState(0)
  const [dialogStageHost, setDialogStageHost] =
    React.useState<HTMLElement | null>(null)

  const registerStageHost = React.useCallback(
    (path: string, element: HTMLElement | null) => {
      if (element) {
        if (stageHosts.get(path) === element) return
        stageHosts.set(path, element)
      } else {
        if (!stageHosts.has(path)) return
        stageHosts.delete(path)
      }
      bumpStageHosts((version) => version + 1)
    },
    [stageHosts]
  )

  const dialogStageHostRef = React.useCallback(
    (element: HTMLDivElement | null) => setDialogStageHost(element),
    []
  )

  // Admits a file into the pool (idempotent), evicting the least recently
  // admitted path beyond the cap. The pool array keeps insertion order —
  // reordering would churn the host registrations — so recency lives in a
  // separate map; the version bump re-renders so the attach set below
  // tracks recency even when pool membership is unchanged.
  const poolStagePath = React.useCallback(
    (path: string) => {
      if (!index.files.has(path)) return
      if (!stageContainers.has(path)) {
        const container = document.createElement("div")

        // Layout/paint containment keeps work inside one preview from
        // invalidating the rest of the page (and vice versa).
        container.className =
          "flex size-full min-h-0 min-w-0 items-center justify-center contain-layout contain-paint"
        stageContainers.set(path, container)
      }

      stageRecency.set(path, ++stageClockRef.current)
      setStageVersion((version) => version + 1)
      setStagePool((previous) => {
        if (previous.includes(path)) return previous

        const next = [...previous, path]

        if (next.length <= GALLERY_STAGE_POOL_SIZE) return next

        let evicted = next[0]

        for (const candidate of next) {
          if (candidate === path) continue
          if (
            (stageRecency.get(candidate) ?? 0) <
            (stageRecency.get(evicted) ?? 0)
          ) {
            evicted = candidate
          }
        }
        return next.filter((candidate) => candidate !== evicted)
      })
    },
    [index, stageContainers, stageRecency]
  )

  const dialogStagePath =
    openedFile !== null && openedFile.kind !== "image"
      ? openedFile.file.path
      : null
  // Only the most recently shown stages stay attached to the DOM, so
  // rotating among a few files stays instant while older pool members wait
  // detached at zero rendering cost. Memoized so host ref callbacks
  // downstream stay referentially stable — recomputing every render would
  // re-register hosts in a loop.
  const attachedStagePaths = React.useMemo(() => {
    void stageVersion

    const attached = [...stagePool]
      .sort((a, b) => (stageRecency.get(b) ?? 0) - (stageRecency.get(a) ?? 0))
      .slice(0, GALLERY_STAGE_ATTACHED_COUNT)

    if (
      dialogStagePath &&
      stagePool.includes(dialogStagePath) &&
      !attached.includes(dialogStagePath)
    ) {
      attached.push(dialogStagePath)
    }
    return attached
  }, [dialogStagePath, stagePool, stageRecency, stageVersion])

  // Reparent each pooled container to its current host. No dependency
  // array: host registration mutates maps in place, so the cheap loop
  // (pool ≤ GALLERY_STAGE_POOL_SIZE) runs every commit instead of chasing
  // every mutation source.
  React.useLayoutEffect(() => {
    for (const [path, container] of stageContainers) {
      if (!stagePool.includes(path)) {
        // Evicted — React already unmounted the portal's children.
        container.remove()
        stageContainers.delete(path)
        continue
      }
      if (dialogStagePath === path) {
        // Leave the container in place until the dialog host mounts.
        if (dialogStageHost && container.parentElement !== dialogStageHost) {
          dialogStageHost.appendChild(container)
        }
        continue
      }

      const target = attachedStagePaths.includes(path)
        ? (stageHosts.get(path) ?? null)
        : null

      if (!target) {
        if (container.parentElement) container.remove()
      } else if (container.parentElement !== target) {
        target.appendChild(container)
      }
    }
  })

  const resolveFileUrl = React.useCallback(
    async (file: FileEntry) => {
      let url = file.url ?? resolvedUrlCache.get(file.path) ?? null

      if (!url && getFileUrl) {
        try {
          url = await getFileUrl(file)
          if (url) resolvedUrlCache.set(file.path, url)
        } catch {
          url = null
        }
      }

      return url
    },
    [getFileUrl, resolvedUrlCache]
  )

  const openFile = React.useCallback(
    (file: FileEntry) => {
      void (async () => {
        const url = await resolveFileUrl(file)

        if (onFileOpen) {
          onFileOpen(file, url)
          return
        }

        const kind = viewerKindForFile(file)

        if (kind && url) {
          // Pool the file so the dialog reuses an already-mounted preview
          // (and the gallery inherits the live viewer after it closes).
          poolStagePath(file.path)
          setOpenedFile({ file, kind, url })
        } else if (url && typeof window !== "undefined") {
          window.open(url, "_blank", "noopener,noreferrer")
        }
      })()
    },
    [onFileOpen, poolStagePath, resolveFileUrl]
  )

  const openFileInNewTab = React.useCallback(
    (file: FileEntry) => {
      void (async () => {
        const url = await resolveFileUrl(file)

        if (url && typeof window !== "undefined") {
          window.open(url, "_blank", "noopener,noreferrer")
        }
      })()
    },
    [resolveFileUrl]
  )

  const downloadFile = React.useCallback(
    (file: FileEntry) => {
      void (async () => {
        const url = await resolveFileUrl(file)

        if (!url) return

        const anchor = document.createElement("a")

        anchor.href = url
        anchor.download = file.name
        anchor.rel = "noopener"
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      })()
    },
    [resolveFileUrl]
  )

  const handleDownloadEntry = React.useCallback(
    (entry: FileSystemEntry) => {
      if (!onDownloadEntry) {
        if (entry.kind === "file") downloadFile(entry)
        return
      }

      const download = Promise.resolve(onDownloadEntry(entry))

      // Native downloads resolve at once; only browser-side zipping is slow
      // enough to reach the delay, so only that path gets a toast.
      let pending: string | number | undefined
      const showPending = setTimeout(() => {
        pending = toast.loading(t("preparingDownload"))
      }, 400)

      void download
        .catch((error) => {
          toast.error(
            error instanceof Error ? error.message : t("errorDownload")
          )
        })
        .finally(() => {
          clearTimeout(showPending)
          if (pending !== undefined) toast.dismiss(pending)
        })
    },
    [downloadFile, onDownloadEntry, t]
  )

  const confirmDeleteEntry = React.useCallback(async () => {
    if (deleteTargets.length === 0 || isDeletingEntry) return
    if (!onDeleteEntry && !onDeleteEntries) return

    setDeletingEntry(true)
    setDeleteEntryError(null)
    // Show a progress bar only for multi-item deletes.
    setBulkProgress(
      deleteTargets.length > 1 ? { done: 0, total: deleteTargets.length } : null
    )

    try {
      if (onDeleteEntries) {
        await onDeleteEntries(deleteTargets, (done, total) =>
          setBulkProgress({ done, total })
        )
      } else if (onDeleteEntry) {
        for (const target of deleteTargets) await onDeleteEntry(target)
      }
      setDeleteTargets([])
      selectEntry(null)
    } catch (error) {
      setDeleteEntryError(
        error instanceof Error ? error.message : t("errorDelete")
      )
    } finally {
      setDeletingEntry(false)
      setBulkProgress(null)
    }
  }, [
    deleteTargets,
    isDeletingEntry,
    onDeleteEntries,
    onDeleteEntry,
    selectEntry,
    t,
  ])

  const confirmRenameEntry = React.useCallback(() => {
    if (!renameEntryTarget || !onRenameEntryAction) return

    const target = renameEntryTarget
    const name = renameEntryName.trim()
    if (!name) {
      setRenameEntryError("Enter a name.")
      return
    }
    if (name === "." || name === ".." || name.includes("/")) {
      setRenameEntryError("Names cannot be '.', '..', or contain '/'.")
      return
    }
    // Unchanged name: just close the inline editor.
    if (name === target.name) {
      setRenameEntryTarget(null)
      setRenameEntryError(null)
      return
    }

    const filePath = `${target.parentPath}${name}`
    const folderPath = normalizeFolderPath(filePath)
    const hasCollision =
      (sortedIndex.files.has(filePath) && target.path !== filePath) ||
      (sortedIndex.folders.has(folderPath) && target.path !== folderPath)

    if (hasCollision) {
      setRenameEntryError("An item with this name already exists.")
      return
    }

    // Close the editor immediately so Enter feels instant; the actual rename
    // (an S3 move + re-list) runs in the background. A spinner on the item
    // shows it's saving, and failures surface via a toast.
    setRenameEntryTarget(null)
    setRenameEntryError(null)
    selectEntry(null)
    setRenamingPaths((previous) => new Set(previous).add(target.path))
    void Promise.resolve(onRenameEntryAction(target, name))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : t("errorRename"))
      })
      .finally(() => {
        setRenamingPaths((previous) => {
          const next = new Set(previous)
          next.delete(target.path)
          return next
        })
      })
  }, [
    onRenameEntryAction,
    renameEntryName,
    renameEntryTarget,
    selectEntry,
    sortedIndex.files,
    sortedIndex.folders,
    t,
  ])

  const startRename = React.useCallback((entry: FileSystemEntry) => {
    setRenameEntryTarget(entry)
    setRenameEntryName(entry.name)
    setRenameEntryError(null)
  }, [])

  const cancelRename = React.useCallback(() => {
    setRenameEntryTarget(null)
    setRenameEntryError(null)
  }, [])

  const renameController = React.useMemo<RenameController>(
    () => ({
      pendingPaths: renamingPaths,
    }),
    [renamingPaths]
  )

  // Run the actual move, reporting per-item progress for the bar. Shared by the
  // Move dialog and drag-and-drop.
  const executeMove = React.useCallback(
    async (targets: FileSystemEntry[], destination: string) => {
      const movedPaths = targets.map((target) => target.path)
      // Hide the moved entries from the source folder right away.
      setOptimisticallyMovedPaths((previous) => {
        const next = new Set(previous)
        for (const path of movedPaths) next.add(path)
        return next
      })
      setBulkProgress(
        targets.length > 1 ? { done: 0, total: targets.length } : null
      )
      try {
        if (onMoveEntries) {
          await onMoveEntries(targets, destination, (done, total) =>
            setBulkProgress({ done, total })
          )
        } else if (onMoveEntry) {
          for (const target of targets) await onMoveEntry(target, destination)
        }
        selectEntry(null)
      } catch (error) {
        // Restore the optimistically-hidden entries on failure.
        setOptimisticallyMovedPaths((previous) => {
          const next = new Set(previous)
          for (const path of movedPaths) next.delete(path)
          return next
        })
        throw error
      } finally {
        setBulkProgress(null)
      }
    },
    [onMoveEntries, onMoveEntry, selectEntry]
  )

  const confirmMoveEntry = React.useCallback(
    async (destination: string) => {
      if (moveTargets.length === 0 || isMovingEntry) return
      if (!onMoveEntry && !onMoveEntries) return

      const error = validateMove(
        moveTargets,
        destination,
        sortedIndex.files,
        sortedIndex.folders
      )
      if (error) {
        setMoveEntryError(t(error.key, error.values))
        return
      }

      setMovingEntry(true)
      setMoveEntryError(null)
      try {
        await executeMove(moveTargets, destination)
        setMoveTargets([])
      } catch (err) {
        setMoveEntryError(err instanceof Error ? err.message : t("errorMove"))
      } finally {
        setMovingEntry(false)
      }
    },
    [
      executeMove,
      isMovingEntry,
      moveTargets,
      onMoveEntries,
      onMoveEntry,
      sortedIndex.files,
      sortedIndex.folders,
      t,
    ]
  )

  // The paths captured when a drag begins — the whole multi-selection when the
  // grabbed item is part of it, otherwise just that item. Captured at drag
  // start so the move can't be thrown off by a selection change mid-gesture.
  const dragSelectionRef = React.useRef<readonly string[] | null>(null)

  // Drop a dragged entry onto a folder. Moves the set captured at drag start.
  // Validates inline and surfaces problems via a toast (no dialog for drag).
  const moveByDrag = React.useCallback(
    (sourcePath: string, destinationFolderPath: string) => {
      const destination = normalizeFolderPath(destinationFolderPath)
      const paths = dragSelectionRef.current ?? [sourcePath]
      const targets = paths
        .map(
          (path) =>
            sortedIndex.files.get(path) ??
            sortedIndex.folders.get(normalizeFolderPath(path)) ??
            null
        )
        .filter((entry): entry is FileSystemEntry => entry !== null)
      if (targets.length === 0) return

      // Dropping onto the folder the items already live in is a no-op.
      if (targets.every((target) => target.parentPath === destination)) return

      const error = validateMove(
        targets,
        destination,
        sortedIndex.files,
        sortedIndex.folders
      )
      if (error) {
        toast.error(t(error.key, error.values))
        return
      }

      void executeMove(targets, destination).catch((err) => {
        toast.error(err instanceof Error ? err.message : t("errorMove"))
      })
    },
    [executeMove, sortedIndex.files, sortedIndex.folders, t]
  )

  // The path grabbed for the current drag (null when not dragging). Drives the
  // "lifted" styling so a multi-selection visibly drags together.
  const [draggingSourcePath, setDraggingSourcePath] = React.useState<
    string | null
  >(null)
  const draggingPaths = React.useMemo<ReadonlySet<string>>(() => {
    if (!draggingSourcePath) return EMPTY_SELECTION
    return selectedPaths.size > 1 && selectedPaths.has(draggingSourcePath)
      ? selectedPaths
      : new Set([draggingSourcePath])
  }, [draggingSourcePath, selectedPaths])

  const handleDragStart = React.useCallback(
    (event: { operation: { source?: { id: unknown } | null } }) => {
      const source = event.operation.source
      const sourcePath = source ? String(source.id) : null
      setDraggingSourcePath(sourcePath)
      // Capture what to move now, so an interleaved click/select can't shrink it.
      dragSelectionRef.current = sourcePath
        ? selectedPathsRef.current.size > 1 &&
          selectedPathsRef.current.has(sourcePath)
          ? Array.from(selectedPathsRef.current)
          : [sourcePath]
        : null
    },
    []
  )

  const handleDragEnd = React.useCallback(
    (event: {
      canceled: boolean
      operation: {
        source?: { id: unknown } | null
        target?: { id: unknown } | null
      }
    }) => {
      setDraggingSourcePath(null)
      if (event.canceled) return
      const source = event.operation.source
      const target = event.operation.target
      if (!source || !target) return
      const sourcePath = String(source.id)
      const destPath = String(target.id)
      if (sourcePath === destPath) return
      // Run the move on the next frame so dnd-kit can finalize the drop first
      // (clear the overlay and the grabbing cursor). Doing the optimistic
      // re-render + re-list inside this handler keeps dnd-kit's renderer busy,
      // which leaves the dragged preview and cursor stuck for the whole move.
      requestAnimationFrame(() => moveByDrag(sourcePath, destPath))
    },
    [moveByDrag]
  )

  const openEntry = React.useCallback(
    (entry: FileSystemEntry) => {
      if (entry.kind === "folder") {
        navigateTo(entry.path)
      } else {
        openFile(entry)
      }
    },
    [navigateTo, openFile]
  )

  // Selecting a lazy folder (columns view, keyboard nav) prefetches children.
  const selectAndPrefetchEntry = React.useCallback(
    (entry: FileSystemEntry | null, modifiers?: SelectionModifiers) => {
      selectEntry(entry, modifiers)
      if (entry?.kind === "folder") ensureChildren(entry.path)
    },
    [ensureChildren, selectEntry]
  )

  const goBack = React.useCallback(() => {
    setHistory((previous) => ({
      ...previous,
      index: Math.max(0, previous.index - 1),
    }))
    setSearchInput("")
    selectEntry(null)
  }, [selectEntry])

  const goForward = React.useCallback(() => {
    setHistory((previous) => ({
      ...previous,
      index: Math.min(previous.stack.length - 1, previous.index + 1),
    }))
    setSearchInput("")
    selectEntry(null)
  }, [selectEntry])

  const currentEntries = React.useMemo(
    () => sortedIndex.children.get(currentPath) ?? [],
    [sortedIndex, currentPath]
  )
  // Mirror the ordered current folder for Shift range selection; read only in
  // click handlers, so syncing in an effect keeps it current without a
  // render-time ref write.
  React.useEffect(() => {
    currentEntriesRef.current = currentEntries
    sortedChildrenRef.current = sortedIndex.children
  }, [currentEntries, sortedIndex])

  // What a context-menu action operates on: the whole multi-selection when the
  // right-clicked entry is part of it, otherwise just that entry.
  const contextTargets = React.useMemo<FileSystemEntry[]>(() => {
    if (!contextMenuEntry) return []
    if (selectedPaths.size > 1 && selectedPaths.has(contextMenuEntry.path)) {
      return Array.from(selectedPaths)
        .map(
          (path) =>
            sortedIndex.files.get(path) ??
            sortedIndex.folders.get(normalizeFolderPath(path)) ??
            null
        )
        .filter((entry): entry is FileSystemEntry => entry !== null)
    }
    return [contextMenuEntry]
  }, [contextMenuEntry, selectedPaths, sortedIndex])

  const contextFileTargets = contextTargets.filter(
    (entry) => entry.kind === "file"
  )
  const contextAllFilesStarred =
    contextFileTargets.length > 0 &&
    contextFileTargets.every((entry) =>
      isStarred?.(entry as FileSystemFileItem)
    )
  const currentFolderName =
    currentPath === "" ? title : pathName(currentPath) || title
  const isLoadingCurrentFolder = loadingFolders.has(currentPath)

  // The list view tree saves its expanded folders here when it unmounts
  // (view switches, navigation) so returning to the list view — or to a
  // previously visited folder — restores the same disclosure state.
  const treeExpansionRef = React.useRef(new Map<string, readonly string[]>())

  const openNewFolderDialog = React.useCallback(() => {
    setNewFolderName("")
    setNewFolderError(null)
    setNewFolderOpen(true)
  }, [])

  const createNewFolder = React.useCallback(async () => {
    if (!onCreateFolderAction || isCreatingFolder) return

    const name = newFolderName.trim()

    if (!name) {
      setNewFolderError("Enter a folder name.")
      return
    }
    if (name === "." || name === ".." || name.includes("/")) {
      setNewFolderError("Folder names cannot be '.', '..', or contain '/'.")
      return
    }

    const path = `${currentPath}${name}/`

    if (
      sortedIndex.folders.has(path) ||
      sortedIndex.files.has(`${currentPath}${name}`)
    ) {
      setNewFolderError("An item with this name already exists.")
      return
    }

    setCreatingFolder(true)
    setNewFolderError(null)
    try {
      await onCreateFolderAction(path)
      setNewFolderOpen(false)
      setNewFolderName("")
    } catch (error) {
      setNewFolderError(
        error instanceof Error ? error.message : t("errorCreateFolder")
      )
    } finally {
      setCreatingFolder(false)
    }
  }, [
    currentPath,
    isCreatingFolder,
    newFolderName,
    onCreateFolderAction,
    sortedIndex.files,
    sortedIndex.folders,
    t,
  ])

  const handleContextMenuCapture = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      let entry: FileSystemEntry | null = null

      for (const target of event.nativeEvent.composedPath()) {
        if (!(target instanceof HTMLElement)) continue

        const absolutePath = target.dataset.fileSystemPath
        const relativePath = target.dataset.itemPath
        const path =
          absolutePath ??
          (relativePath ? `${currentPath}${relativePath}` : null)

        if (!path) continue

        entry =
          sortedIndex.files.get(path) ??
          sortedIndex.folders.get(normalizeFolderPath(path)) ??
          null

        if (entry) break
      }

      // Right-clicking inside an existing multi-selection keeps it; otherwise
      // the click selects just the targeted entry.
      if (
        !entry ||
        !(
          selectedPathsRef.current.size > 1 &&
          selectedPathsRef.current.has(entry.path)
        )
      ) {
        selectAndPrefetchEntry(entry)
      }
      setContextMenuEntry(entry)
    },
    [currentPath, selectAndPrefetchEntry, sortedIndex]
  )

  const viewProps: FileSystemViewProps = {
    attachedStagePaths,
    currentPath,
    entries: currentEntries,
    fileFilter,
    getFileUrl,
    index: sortedIndex,
    loadPreviewImageUrlAction,
    loadingFolders,
    onOpen: openEntry,
    onSelect: selectAndPrefetchEntry,
    onSelectMany: selectMany,
    onSortColumnClick: toggleSortColumn,
    pageUrlCache,
    poolStagePath,
    registerStageHost,
    renderFilePreview,
    searchQuery,
    selectedEntry,
    selectedPath,
    selectedPaths,
    draggingPaths,
    sort,
    treeExpansionRef,
  }

  const openedFileName = openedFile
    ? (openedFile.file.name ?? openedFile.file.path)
    : ""
  const activeViewOption = VIEW_OPTIONS.find((option) => option.value === view)
  const viewerCloseToolbarAction = (
    <DialogClose
      aria-label={t("closePreview")}
      render={<Button type="button" variant="ghost" size="icon-sm" />}
    >
      <AppIcon icon={Cancel01Icon} className="size-4" />
    </DialogClose>
  )

  return (
    <ShowFileExtensionsContext.Provider value={showFileExtensions}>
      <RenameContext.Provider value={renameController}>
        <div
          ref={rootRef}
          tabIndex={-1}
          data-slot="file-system"
          onKeyDown={(event) => {
            // ⌘F focuses the toolbar search while focus is inside the component.
            if ((event.metaKey || event.ctrlKey) && event.key === "f") {
              event.preventDefault()
              setIsSearchExpanded(true)
              searchInputRef.current?.focus()
            }
          }}
          className={cn(
            "flex h-120 min-h-0 flex-col overflow-hidden rounded-xl border bg-background text-foreground outline-none",
            className
          )}
        >
          <FileSystemIconSpriteSheet />
          <div className="relative grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b bg-muted/40 px-2">
            <div className="flex min-w-0 items-center gap-0.5">
              {headerLeading}
              <button
                type="button"
                aria-label={t("back")}
                title={t("back")}
                disabled={!canGoBack}
                onClick={goBack}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
              >
                <AppIcon icon={ArrowLeft01Icon} className="size-4.5" />
              </button>
              <button
                type="button"
                aria-label={t("forward")}
                title={t("forward")}
                disabled={!canGoForward}
                onClick={goForward}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
              >
                <AppIcon icon={ArrowRight01Icon} className="size-4.5" />
              </button>
              {headerLayout !== "minimal" ? (
                <div className="ml-1.5 flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">
                    {currentFolderName}
                  </span>
                  {currentPath === "" ? titleBadge : null}
                </div>
              ) : null}
            </div>
            {headerLayout !== "full" || isBelowIpadWidth ? (
              <Select
                value={view}
                onValueChange={(value) => setView(value as FileSystemView)}
              >
                <SelectTrigger
                  size="sm"
                  aria-label={t("view")}
                  // Icon-only like the sort select: sheds the base min-width to
                  // hug icon + chevron at the filter button's 28px height.
                  className="h-7 min-h-7 w-auto min-w-0 [&_svg]:size-4"
                >
                  <SelectValue>
                    {activeViewOption ? (
                      <AppIcon
                        icon={activeViewOption.icon}
                        className="size-4"
                      />
                    ) : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {VIEW_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="flex items-center gap-2">
                        <AppIcon icon={option.icon} className="size-4" />
                        {t(option.labelKey)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Tabs
                size="sm"
                value={view}
                onValueChange={(value) => setView(value as FileSystemView)}
                className="gap-0"
              >
                <TabsList>
                  {VIEW_OPTIONS.map((option) => (
                    <TabsTrigger
                      key={option.value}
                      value={option.value}
                      aria-label={t(option.labelKey)}
                      title={t(option.labelKey)}
                      className="grow-0"
                    >
                      <AppIcon icon={option.icon} className="size-4" />
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
            <div className="flex min-w-0 items-center justify-end gap-1">
              <FileSystemSortSelect
                layout={headerLayout}
                onKeyChange={applySortKey}
                showLabel={!isBelowIpadWidth}
                sort={sort}
              />
              <FileSystemFilterMenu
                fileTypeOptions={fileTypeOptions}
                filters={filters}
                onOpenCustomRange={openDateRangeDialog}
                onSelectDatePreset={setDatePresetFilter}
                onToggleFileType={toggleFileTypeFilterValue}
              />
              <FileSystemSearchField
                inputRef={searchInputRef}
                isExpanded={isSearchExpanded}
                layout={headerLayout}
                onExpandedChange={setIsSearchExpanded}
                onValueChange={setSearchInput}
                value={searchInput}
              />
            </div>
          </div>
          {hasActiveFilters ? (
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground">
              {filters.map((filter) => {
                const dateFilterType =
                  filter.type === "fileType" ? null : filter.type

                return (
                  <FileSystemFilterPill
                    key={filter.id}
                    fileTypeOptions={fileTypeOptions}
                    filter={filter}
                    onOpenCustomRange={
                      dateFilterType
                        ? () => openDateRangeDialog(dateFilterType)
                        : undefined
                    }
                    onOperatorChange={(operator) =>
                      setFilters((previous) =>
                        previous.map((entry) =>
                          entry.id === filter.id
                            ? { ...entry, operator }
                            : entry
                        )
                      )
                    }
                    onRemove={() =>
                      setFilters((previous) =>
                        previous.filter((entry) => entry.id !== filter.id)
                      )
                    }
                    onSelectDatePreset={(preset) =>
                      setFilters((previous) =>
                        previous.map((entry) =>
                          entry.id === filter.id
                            ? {
                                ...entry,
                                operator:
                                  entry.operator === "before" ||
                                  entry.operator === "after"
                                    ? entry.operator
                                    : "after",
                                value: [preset],
                              }
                            : entry
                        )
                      )
                    }
                    onToggleFileType={toggleFileTypeFilterValue}
                  />
                )
              })}
              <button
                type="button"
                onClick={() => setFilters([])}
                className="rounded-md px-1.5 py-0.5 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("clearFilters")}
              </button>
            </div>
          ) : null}
          <ContextMenu
            onOpenChange={(open) => {
              if (!open) setContextMenuEntry(null)
            }}
          >
            <ContextMenuTrigger
              className="relative min-h-0 flex-1"
              onContextMenuCapture={handleContextMenuCapture}
            >
              <DragDropProvider
                // Pointer only — the default keyboard sensor would start a drag
                // on Enter/Space when a tile is focused, hijacking Enter (which
                // opens the file).
                sensors={[PointerSensor]}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                {isLoading ? (
                  <FileSystemEmptyState label={t("loading")} />
                ) : isLoadingCurrentFolder && currentEntries.length === 0 ? (
                  <FileSystemEmptyState label={t("loading")} isLoading />
                ) : currentEntries.length === 0 &&
                  (view !== "columns" || isSearching || hasActiveFilters) ? (
                  <FileSystemEmptyState
                    label={
                      isSearching
                        ? t("noSearchResults", {
                            query: searchInput.trim(),
                          })
                        : hasActiveFilters
                          ? t("emptyFiltered")
                          : t("emptyFolder")
                    }
                  />
                ) : view === "icons" ? (
                  <FileSystemIconsView {...viewProps} />
                ) : view === "list" ? (
                  <FileSystemListView {...viewProps} />
                ) : view === "columns" ? (
                  <FileSystemColumnsView {...viewProps} />
                ) : (
                  <FileSystemGalleryView {...viewProps} />
                )}
                <DragOverlay dropAnimation={null}>
                  {(source) => {
                    const path = source ? String(source.id) : null
                    const entry = path
                      ? (sortedIndex.files.get(path) ??
                        sortedIndex.folders.get(normalizeFolderPath(path)))
                      : null
                    if (!entry) return null
                    return (
                      <FileSystemDragPreview
                        entry={entry}
                        count={Math.max(1, draggingPaths.size)}
                        showFileExtensions={showFileExtensions}
                      />
                    )
                  }}
                </DragOverlay>
              </DragDropProvider>
            </ContextMenuTrigger>
            <ContextMenuPopup align="start" side="bottom">
              {contextMenuEntry ? (
                contextTargets.length > 1 ? (
                  // Multi-selection: only the operations that make sense for a
                  // set of entries.
                  <>
                    <ContextMenuItem disabled className="opacity-100">
                      {t("itemsSelectedCount", {
                        count: contextTargets.length,
                      })}
                    </ContextMenuItem>
                    {onToggleStar && contextFileTargets.length > 0 ? (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() => {
                            for (const file of contextFileTargets) {
                              const starred =
                                isStarred?.(file as FileSystemFileItem) ?? false
                              if (contextAllFilesStarred ? starred : !starred) {
                                onToggleStar(file as FileSystemFileItem)
                              }
                            }
                          }}
                        >
                          <AppIcon
                            icon={FavouriteIcon}
                            className={
                              contextAllFilesStarred
                                ? "fill-current text-amber-500"
                                : undefined
                            }
                          />
                          {contextAllFilesStarred
                            ? t("removeStar")
                            : t("addStar")}
                        </ContextMenuItem>
                      </>
                    ) : null}
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onClick={() => {
                        for (const entry of contextTargets) {
                          handleDownloadEntry(entry)
                        }
                      }}
                    >
                      <AppIcon icon={Download01Icon} />
                      {t("downloadItems", { count: contextTargets.length })}
                    </ContextMenuItem>
                    {onMoveEntry || onMoveEntries ? (
                      <ContextMenuItem
                        onClick={() => {
                          setMoveTargets(contextTargets)
                          setMoveEntryError(null)
                        }}
                      >
                        <AppIcon icon={MoveIcon} />
                        {t("moveItems", { count: contextTargets.length })}
                      </ContextMenuItem>
                    ) : null}
                    {onDeleteEntry || onDeleteEntries ? (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          variant="destructive"
                          onClick={() => {
                            setDeleteEntryError(null)
                            setDeleteTargets(contextTargets)
                          }}
                        >
                          <AppIcon icon={Delete02Icon} />
                          {t("deleteItems", { count: contextTargets.length })}
                        </ContextMenuItem>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <ContextMenuItem
                      onClick={() => openEntry(contextMenuEntry)}
                    >
                      <AppIcon
                        icon={
                          contextMenuEntry.kind === "folder"
                            ? Folder01Icon
                            : File01Icon
                        }
                      />
                      {t("open")}
                    </ContextMenuItem>
                    {contextMenuEntry.kind === "file" ? (
                      <ContextMenuItem
                        onClick={() => openFileInNewTab(contextMenuEntry)}
                      >
                        <AppIcon icon={ExternalLinkIcon} />
                        {t("openInNewTab")}
                      </ContextMenuItem>
                    ) : null}
                    {contextMenuEntry.kind === "file" && onToggleStar ? (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() => onToggleStar(contextMenuEntry)}
                        >
                          <AppIcon
                            icon={FavouriteIcon}
                            className={
                              isStarred?.(contextMenuEntry)
                                ? "fill-current text-amber-500"
                                : undefined
                            }
                          />
                          {isStarred?.(contextMenuEntry)
                            ? t("removeStar")
                            : t("addStar")}
                        </ContextMenuItem>
                      </>
                    ) : null}
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onClick={() => setInfoTarget(contextMenuEntry)}
                    >
                      <AppIcon icon={InformationCircleIcon} />
                      {t("getInfo")}
                    </ContextMenuItem>
                    {onDownloadEntry ||
                    onRenameEntryAction ||
                    onMoveEntry ||
                    contextMenuEntry.kind === "file" ? (
                      <ContextMenuSeparator />
                    ) : null}
                    {onDownloadEntry || contextMenuEntry.kind === "file" ? (
                      <ContextMenuItem
                        onClick={() => handleDownloadEntry(contextMenuEntry)}
                      >
                        <AppIcon icon={Download01Icon} />
                        {t("download")}
                      </ContextMenuItem>
                    ) : null}
                    {onRenameEntryAction ? (
                      <ContextMenuItem
                        onClick={() => startRename(contextMenuEntry)}
                      >
                        <AppIcon icon={Edit02Icon} />
                        {t("rename")}
                      </ContextMenuItem>
                    ) : null}
                    {onMoveEntry ? (
                      <ContextMenuItem
                        onClick={() => {
                          setMoveTargets([contextMenuEntry])
                          setMoveEntryError(null)
                        }}
                      >
                        <AppIcon icon={MoveIcon} />
                        {t("move")}
                      </ContextMenuItem>
                    ) : null}
                    {onDeleteEntry ? (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          variant="destructive"
                          onClick={() => {
                            setDeleteEntryError(null)
                            setDeleteTargets([contextMenuEntry])
                          }}
                        >
                          <AppIcon icon={Delete02Icon} />
                          {t("delete")}
                        </ContextMenuItem>
                      </>
                    ) : null}
                  </>
                )
              ) : (
                <>
                  {onCreateFolderAction ? (
                    <>
                      <ContextMenuItem onClick={openNewFolderDialog}>
                        <AppIcon icon={Folder01Icon} />
                        {t("newFolder")}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                    </>
                  ) : null}
                  <ContextMenuItem disabled={!canGoBack} onClick={goBack}>
                    <AppIcon icon={ArrowLeft01Icon} />
                    {t("back")}
                  </ContextMenuItem>
                  <ContextMenuItem disabled={!canGoForward} onClick={goForward}>
                    <AppIcon icon={ArrowRight01Icon} />
                    {t("forward")}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => window.location.reload()}>
                    <AppIcon icon={RotateClockwiseIcon} />
                    {t("reload")}
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuPopup>
          </ContextMenu>
          <div
            aria-live="polite"
            className="flex h-7 shrink-0 items-center justify-center gap-1 border-t bg-muted/40 px-3 text-xs text-muted-foreground"
          >
            <span>
              {isSearching
                ? t("footerResults", { count: currentEntries.length })
                : t("footerItems", { count: currentEntries.length })}
            </span>
            {selectedPaths.size > 1 ? (
              <span>
                {t("footerSelectedCount", { count: selectedPaths.size })}
              </span>
            ) : selectedEntry ? (
              <span
                className="min-w-0 max-[800px]:max-w-40 max-[800px]:truncate"
                title={t("selectedNameTitle", {
                  name: formatEntryName(selectedEntry, showFileExtensions),
                })}
              >
                {t("footerSelectedName", {
                  name: formatEntryName(selectedEntry, showFileExtensions),
                })}
              </span>
            ) : null}
          </div>
          <NewFolderDialog
            currentFolderName={currentFolderName}
            error={newFolderError}
            isPending={isCreatingFolder}
            name={newFolderName}
            open={isNewFolderOpen}
            onNameChangeAction={(name) => {
              setNewFolderName(name)
              setNewFolderError(null)
            }}
            onOpenChangeAction={(open) => {
              if (isCreatingFolder) return
              setNewFolderOpen(open)
              if (!open) setNewFolderError(null)
            }}
            onSubmitAction={() => void createNewFolder()}
          />
          <RenameEntryDialog
            entry={renameEntryTarget}
            error={renameEntryError}
            isPending={
              renameEntryTarget
                ? renamingPaths.has(renameEntryTarget.path)
                : false
            }
            name={renameEntryName}
            onNameChangeAction={(name) => {
              setRenameEntryName(name)
              setRenameEntryError(null)
            }}
            onOpenChangeAction={(open) => {
              if (!open) cancelRename()
            }}
            onSubmitAction={() => void confirmRenameEntry()}
          />
          <MoveEntriesDialog
            error={moveEntryError}
            isPending={isMovingEntry}
            progress={bulkProgress}
            targets={moveTargets}
            index={sortedIndex}
            ensureChildrenAction={ensureChildren}
            loadingFolders={loadingFolders}
            onMoveAction={(destination) => {
              setMoveEntryError(null)
              void confirmMoveEntry(destination)
            }}
            onOpenChangeAction={(open) => {
              if (isMovingEntry) return
              if (!open) {
                setMoveTargets([])
                setMoveEntryError(null)
              }
            }}
          />
          <InfoEntryDialog
            entry={infoTarget}
            onOpenChangeAction={(open) => {
              if (!open) setInfoTarget(null)
            }}
          />
          <DeleteEntriesDialog
            error={deleteEntryError}
            isPending={isDeletingEntry}
            progress={bulkProgress}
            targets={deleteTargets}
            onOpenChangeAction={(open) => {
              if (isDeletingEntry) return
              if (!open) {
                setDeleteTargets([])
                setDeleteEntryError(null)
              }
            }}
            onSubmitAction={() => void confirmDeleteEntry()}
          />
          <Dialog
            open={openedFile !== null}
            onOpenChange={(open) => {
              if (!open) setOpenedFile(null)
            }}
          >
            {openedFile ? (
              <DialogContent
                className={cn(
                  "overflow-hidden p-0",
                  VIEWER_DIALOG_CLASSNAMES[openedFile.kind]
                )}
                showCloseButton={openedFile.kind === "image"}
              >
                <DialogTitle className="sr-only">{openedFileName}</DialogTitle>
                {openedFile.kind === "image" ? (
                  <img
                    src={openedFile.url}
                    alt={openedFileName}
                    className="max-h-[88vh] w-auto max-w-full rounded-2xl object-contain"
                  />
                ) : (
                  // The pooled preview reparents into this host (see the layout
                  // effect above), so a viewer the gallery already loaded
                  // carries over live instead of remounting behind a loading
                  // state.
                  <div
                    ref={dialogStageHostRef}
                    className="flex h-full min-h-0 flex-1 flex-col"
                  />
                )}
              </DialogContent>
            ) : null}
            {/* The pooled previews. Rendered inside <Dialog> so the dialog
            variant's close toolbar button keeps its context; each portal's
            container never changes, the container's parent does. */}
            {stagePool.map((path) => {
              const file = index.files.get(path)
              const container = stageContainers.get(path)

              if (!file || !container) return null

              const isOpenedInDialog =
                openedFile !== null &&
                openedFile.kind !== "image" &&
                openedFile.file.path === path

              return createPortal(
                <FileSystemGalleryStage
                  file={file}
                  getFileUrl={getFileUrl}
                  loadPreviewImageUrlAction={loadPreviewImageUrlAction}
                  pageUrlCache={pageUrlCache}
                  renderFilePreview={renderFilePreview}
                  toolbarActions={
                    isOpenedInDialog ? viewerCloseToolbarAction : undefined
                  }
                  urlCache={resolvedUrlCache}
                  variant={isOpenedInDialog ? "dialog" : "stage"}
                />,
                container,
                path
              )
            })}
          </Dialog>
          {dateRangeDialog ? (
            <FileSystemDateRangeDialog
              initialRange={dateRangeDialog.initialRange}
              onApplyAction={(from, to) => {
                applyCustomDateRange(dateRangeDialog.type, from, to)
                setDateRangeDialog(null)
              }}
              onCloseAction={() => setDateRangeDialog(null)}
            />
          ) : null}
        </div>
      </RenameContext.Provider>
    </ShowFileExtensionsContext.Provider>
  )
}

// Shared style for the ghost icon buttons in the toolbar.
const TOOLBAR_ICON_BUTTON_CLASSNAME =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"

// macOS Finder-style toolbar search. At the full layout it sits inline in
// the header's right column; at compact widths it collapses into a ghost
// icon button that opens the input in a popover (a dot marks the button
// while a query keeps filtering the views).
function FileSystemSearchField({
  inputRef,
  isExpanded,
  layout,
  onExpandedChange,
  onValueChange,
  value,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  isExpanded: boolean
  layout: "full" | "compact" | "minimal"
  onExpandedChange: (isExpanded: boolean) => void
  onValueChange: (value: string) => void
  value: string
}) {
  const t = useTranslations("Explorer")
  const isInline = layout === "full"

  React.useEffect(() => {
    if (!isInline && isExpanded) inputRef.current?.focus()
  }, [inputRef, isExpanded, isInline])

  const input = (
    <div
      className={cn(
        "relative flex h-7 min-w-0 flex-1 items-center rounded-lg border border-input bg-popover text-sm text-foreground shadow-xs/5 transition-shadow outline-none not-dark:bg-clip-padding before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] not-focus-within:before:shadow-[0_1px_--theme(--color-black/4%)] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background dark:bg-input/32 dark:not-focus-within:before:shadow-[0_-1px_--theme(--color-white/6%)]",
        isInline && "max-w-56"
      )}
    >
      <AppIcon
        icon={Search01Icon}
        className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground"
      />
      <input
        ref={inputRef}
        type="text"
        role="searchbox"
        aria-label={t("searchFiles")}
        placeholder={t("searchPlaceholder")}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return
          event.preventDefault()
          event.stopPropagation()
          if (value) {
            onValueChange("")
          } else {
            onExpandedChange(false)
            event.currentTarget.blur()
          }
        }}
        className="h-full w-full min-w-0 rounded-[inherit] bg-transparent pr-6 pl-7 outline-none placeholder:text-muted-foreground"
      />
      {value ? (
        <button
          type="button"
          aria-label={t("clearSearch")}
          onClick={() => {
            onValueChange("")
            inputRef.current?.focus()
          }}
          className="absolute right-1 flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AppIcon icon={Cancel01Icon} className="size-3" />
        </button>
      ) : null}
    </div>
  )

  if (isInline) {
    // A fixed basis (not flex-1) keeps the whole toolbar cluster packed
    // against the header's right edge; the input shrinks first when the
    // header tightens.
    return <div className="flex w-56 min-w-32 items-center">{input}</div>
  }

  return (
    <Popover open={isExpanded} onOpenChange={onExpandedChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={t("search")}
            title={t("search")}
            className={cn(TOOLBAR_ICON_BUTTON_CLASSNAME, "relative")}
          />
        }
      >
        <AppIcon icon={Search01Icon} className="size-4" />
        {value ? (
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-64 p-1">
        {input}
      </PopoverContent>
    </Popover>
  )
}

// Toolbar "sort by" select. The full layout shows the active key's label; at
// compact widths the trigger collapses to the sort glyph + chevron.
function FileSystemSortSelect({
  layout,
  onKeyChange,
  showLabel,
  sort,
}: {
  layout: "full" | "compact" | "minimal"
  onKeyChange: (key: FileSystemSortKey) => void
  showLabel: boolean
  sort: FileSystemSortState
}) {
  const t = useTranslations("Explorer")
  const activeOption = SORT_OPTIONS.find((option) => option.key === sort.key)

  return (
    <Select
      value={sort.key}
      onValueChange={(value) => onKeyChange(value as FileSystemSortKey)}
    >
      <SelectTrigger
        size="sm"
        aria-label={t("sortBy")}
        title={t("sortBy")}
        className="h-7 min-h-7 w-auto min-w-0 shrink-0 [&_svg]:size-4"
      >
        <SelectValue>
          <span className="flex items-center gap-1.5">
            <AppIcon icon={ArrowUpDownIcon} className="size-4" />
            {layout === "full" && showLabel && activeOption
              ? t(SORT_TRIGGER_KEYS[activeOption.key])
              : null}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.key} value={option.key}>
            {t(SORT_LABEL_KEYS[option.key])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// Searchable file-type list (cmdk) rendered inside a menu popup, so the
// long MIME list can be filtered by typing. Selection toggles stay open for
// multi-select; ArrowUp/Down and Enter come from cmdk's combobox semantics.
function FileSystemFileTypeCommand({
  checkedMimes,
  onToggle,
  options,
}: {
  checkedMimes: string[]
  onToggle: (mime: string, checked: boolean) => void
  options: FileTypeFilterOption[]
}) {
  const t = useTranslations("Explorer")
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  // The menu focuses its popup when it opens; pull focus into the search
  // field so typing filters immediately.
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus())

    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <Command
      // -m-1 spans the menu viewport's built-in padding so the search
      // field's bottom border runs edge to edge.
      className="-m-1 w-[calc(100%+(--spacing(2)))] bg-transparent"
      // cmdk owns the keyboard while focus is in the list; only Escape
      // (close the menu) and Tab continue outward.
      onKeyDown={(event) => {
        if (event.key !== "Escape" && event.key !== "Tab") {
          event.stopPropagation()
        }
      }}
    >
      <CommandInput
        ref={inputRef}
        placeholder={t("searchFileTypes")}
        className="h-9"
      />
      <CommandList className="max-h-none">
        <CommandEmpty>{t("noFileTypes")}</CommandEmpty>
        <ScrollArea orientation="vertical" className="h-auto max-h-64">
          {FILE_TYPE_FILTER_GROUPS.map((group) => {
            const groupOptions = options.filter(
              (option) => option.group === group
            )

            if (groupOptions.length === 0) return null

            return (
              <CommandGroup key={group} heading={t(GROUP_KEYS[group])}>
                {groupOptions.map((option) => {
                  const isChecked = checkedMimes.includes(option.mime)

                  return (
                    <CommandItem
                      key={option.mime}
                      value={option.label}
                      keywords={[option.mime]}
                      onSelect={() => onToggle(option.mime, !isChecked)}
                    >
                      <AppIcon
                        icon={Tick02Icon}
                        className={cn(
                          "size-4 text-foreground",
                          !isChecked && "opacity-0"
                        )}
                      />
                      <FileTypeIcon
                        fileName={option.iconFileName}
                        className="size-4"
                      />
                      {option.label}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )
          })}
        </ScrollArea>
      </CommandList>
    </Command>
  )
}

// Toolbar filter menu: file types as a searchable checklist, dates as
// single-select presets plus a custom range, mirroring Extend's table
// filters.
function FileSystemFilterMenu({
  fileTypeOptions,
  filters,
  onOpenCustomRange,
  onSelectDatePreset,
  onToggleFileType,
}: {
  fileTypeOptions: FileTypeFilterOption[]
  filters: FileSystemFilter[]
  onOpenCustomRange: (type: FileSystemDateFilterType) => void
  onSelectDatePreset: (type: FileSystemDateFilterType, preset: string) => void
  onToggleFileType: (mime: string, checked: boolean) => void
}) {
  const t = useTranslations("Explorer")
  const fileTypeFilter = filters.find((filter) => filter.type === "fileType")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t("filter")}
            title={t("filter")}
            className="relative size-7 sm:size-7"
          />
        }
      >
        <AppIcon icon={FilterIcon} className="size-4" />
        {filters.length > 0 ? (
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <AppIcon
              icon={File01Icon}
              className="size-4 text-muted-foreground"
            />
            {t("filterFileType")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-60">
            <FileSystemFileTypeCommand
              checkedMimes={fileTypeFilter?.value ?? []}
              onToggle={onToggleFileType}
              options={fileTypeOptions}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {(["dateModified", "dateCreated"] as const).map((type) => (
          <DropdownMenuSub key={type}>
            <DropdownMenuSubTrigger>
              <AppIcon
                icon={Calendar03Icon}
                className="size-4 text-muted-foreground"
              />
              {t(FILTER_TYPE_KEYS[type])}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <ScrollArea orientation="vertical" className="h-auto max-h-72">
                {DATE_FILTER_PRESETS.map((preset) => (
                  <DropdownMenuItem
                    key={preset}
                    onClick={() => onSelectDatePreset(type, preset)}
                  >
                    {t(DATE_PRESET_KEYS[preset])}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => onOpenCustomRange(type)}>
                  {t("customRange")}
                </DropdownMenuItem>
              </ScrollArea>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const FILTER_PILL_SEGMENT_CLASSNAME =
  "flex h-5 items-center gap-1 border border-l-0 bg-background px-1.5 whitespace-nowrap text-foreground"

const FILTER_PILL_BUTTON_CLASSNAME = cn(
  FILTER_PILL_SEGMENT_CLASSNAME,
  "transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
)

// One applied filter, rendered as a segmented pill in the status bar:
// type · operator · value · remove, each segment interactive like Extend's
// table filter pills.
function FileSystemFilterPill({
  fileTypeOptions,
  filter,
  onOpenCustomRange,
  onOperatorChange,
  onRemove,
  onSelectDatePreset,
  onToggleFileType,
}: {
  fileTypeOptions: FileTypeFilterOption[]
  filter: FileSystemFilter
  onOpenCustomRange?: () => void
  onOperatorChange: (operator: FileSystemFilterOperator) => void
  onRemove: () => void
  onSelectDatePreset: (preset: string) => void
  onToggleFileType: (mime: string, checked: boolean) => void
}) {
  const t = useTranslations("Explorer")
  const isCustomRange =
    filter.type !== "fileType" && isCustomDateRangeValue(filter.value)
  const selectedTypeLabels =
    filter.type === "fileType"
      ? filter.value.map(
          (mime) =>
            fileTypeOptions.find((option) => option.mime === mime)?.label ??
            mime
        )
      : []

  return (
    <div className="flex items-center text-xs">
      <span
        className={cn(
          FILTER_PILL_SEGMENT_CLASSNAME,
          "rounded-l-md border-l text-primary"
        )}
      >
        <AppIcon
          icon={filter.type === "fileType" ? File01Icon : Calendar03Icon}
          className="size-3"
        />
        {t(FILTER_TYPE_KEYS[filter.type])}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={cn(FILTER_PILL_BUTTON_CLASSNAME, "text-primary")}
            />
          }
        >
          {t(OPERATOR_KEYS[filter.operator])}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-28">
          {filterOperatorChoices(filter).map((operator) => (
            <DropdownMenuItem
              key={operator}
              onClick={() => onOperatorChange(operator)}
            >
              {t(OPERATOR_KEYS[operator])}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {filter.type === "fileType" ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                title={selectedTypeLabels.join(", ")}
                className={FILTER_PILL_BUTTON_CLASSNAME}
              />
            }
          >
            {filter.value.length === 1
              ? selectedTypeLabels[0]
              : t("selectedCount", { count: filter.value.length })}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <FileSystemFileTypeCommand
              checkedMimes={filter.value}
              onToggle={onToggleFileType}
              options={fileTypeOptions}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : isCustomRange ? (
        <button
          type="button"
          onClick={onOpenCustomRange}
          className={FILTER_PILL_BUTTON_CLASSNAME}
        >
          {filter.value
            .map((value) => new Date(value).toLocaleDateString())
            .join(" – ")}
        </button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button type="button" className={FILTER_PILL_BUTTON_CLASSNAME} />
            }
          >
            {DATE_PRESET_KEYS[filter.value[0]]
              ? t(DATE_PRESET_KEYS[filter.value[0]])
              : filter.value[0]}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <ScrollArea orientation="vertical" className="h-auto max-h-72">
              {DATE_FILTER_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset}
                  onClick={() => onSelectDatePreset(preset)}
                >
                  {t(DATE_PRESET_KEYS[preset])}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={onOpenCustomRange}>
                {t("customRange")}
              </DropdownMenuItem>
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <button
        type="button"
        aria-label={t("removeFilter", {
          label: t(FILTER_TYPE_KEYS[filter.type]),
        })}
        onClick={onRemove}
        className={cn(
          FILTER_PILL_BUTTON_CLASSNAME,
          "rounded-r-md px-1 text-muted-foreground hover:text-foreground"
        )}
      >
        <AppIcon icon={Cancel01Icon} className="size-3" />
      </button>
    </div>
  )
}
