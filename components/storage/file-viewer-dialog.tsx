"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { useTheme } from "next-themes"

import { getFileKind, type FileKind } from "@/lib/file-kind"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import type { FileSystemFileItem } from "@/components/explorer/types"
import {
  AppIcon,
  Cancel01Icon,
  Download01Icon,
  Edit02Icon,
  FavouriteIcon,
  File01Icon,
  Search01Icon,
} from "@/components/foundations/icons"
import {
  CodeViewer,
  type CodeViewerHandle,
  type CodeViewerStatus,
} from "@/components/viewers/code/code-viewer"

const LazyPDFViewer = React.lazy(() =>
  import("@/components/viewers/pdf/pdf-viewer").then((mod) => ({
    default: mod.PDFViewer,
  }))
)
const LazyDocxViewerPreview = React.lazy(() =>
  import("@/components/viewers/docx/docx-viewer").then((mod) => ({
    default: mod.DocxViewerPreview,
  }))
)
const LazyXlsxViewerPreview = React.lazy(() =>
  import("@/components/viewers/xlsx/xlsx-viewer").then((mod) => ({
    default: mod.XlsxViewerPreview,
  }))
)
const LazyDrawioViewer = React.lazy(() =>
  import("@/components/viewers/drawio/drawio-viewer").then((mod) => ({
    default: mod.DrawioViewer,
  }))
)
const LazyVideoPlayer = React.lazy(() => import("react-player"))

const CLEAN_STATUS: CodeViewerStatus = { dirty: false, saving: false }

const DIALOG_CLASSNAMES: Record<FileKind, string> = {
  text: "h-[85vh] w-[min(96vw,80rem)] max-w-none p-0",
  pdf: "h-[88vh] w-[min(96vw,68rem)] max-w-none p-0",
  docx: "h-[88vh] w-[min(96vw,68rem)] max-w-none p-0",
  xlsx: "h-[85vh] w-[min(96vw,100rem)] max-w-none p-0",
  drawio: "h-[88vh] w-[min(96vw,84rem)] max-w-none p-0",
  image: "max-h-[88vh] w-fit min-w-[18rem] max-w-[min(96vw,64rem)] p-0",
  video: "w-[min(96vw,72rem)] max-w-none p-0",
  audio: "w-[min(96vw,36rem)] max-w-none p-0",
  other: "max-w-md",
}

function ViewerFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  )
}

function UnsupportedFile({ fileName, url }: { fileName: string; url: string }) {
  const t = useTranslations("Viewer")
  return (
    <div className="flex flex-col items-center gap-4 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <AppIcon icon={File01Icon} className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("noPreviewTitle")}</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {t("noPreviewDescription")}
        </p>
      </div>
      <div className="flex gap-2">
        <Button render={<a href={url} download={fileName} />}>
          <AppIcon icon={Download01Icon} className="size-4" />
          {t("download")}
        </Button>
        <Button
          variant="outline"
          render={<a href={url} target="_blank" rel="noopener noreferrer" />}
        >
          {t("openInNewTab")}
        </Button>
      </div>
    </div>
  )
}

function ViewerBody({
  kind,
  fileName,
  url,
  codeViewerRef,
  editing,
  onSaveAction,
  onStatusChangeAction,
}: {
  kind: FileKind
  fileName: string
  url: string
  codeViewerRef: React.RefObject<CodeViewerHandle | null>
  editing: boolean
  onSaveAction?: (text: string, contentType: string | null) => Promise<void>
  onStatusChangeAction: (status: CodeViewerStatus) => void
}) {
  const { resolvedTheme } = useTheme()
  const [isDark, setIsDark] = React.useState(resolvedTheme === "dark")
  React.useEffect(() => {
    setIsDark(resolvedTheme === "dark")
  }, [resolvedTheme])

  switch (kind) {
    case "text":
      return (
        <CodeViewer
          ref={codeViewerRef}
          url={url}
          fileName={fileName}
          editable={editing}
          onSaveAction={onSaveAction}
          onStatusChangeAction={onStatusChangeAction}
        />
      )
    case "pdf":
      return (
        <React.Suspense fallback={<ViewerFallback />}>
          <LazyPDFViewer src={url} showUpload={false} className="h-full" />
        </React.Suspense>
      )
    case "docx":
      return (
        <React.Suspense fallback={<ViewerFallback />}>
          <LazyDocxViewerPreview
            src={url}
            fileName={fileName}
            className="h-full"
            isDark={isDark}
            onIsDarkChangeAction={setIsDark}
            showFileName={false}
            showUpload={false}
          />
        </React.Suspense>
      )
    case "xlsx":
      return (
        <React.Suspense fallback={<ViewerFallback />}>
          <LazyXlsxViewerPreview
            src={url}
            fileName={fileName}
            className="h-full"
            isDark={isDark}
            onIsDarkChangeAction={setIsDark}
            showUpload={false}
          />
        </React.Suspense>
      )
    case "drawio":
      return (
        <React.Suspense fallback={<ViewerFallback />}>
          <LazyDrawioViewer
            src={url}
            fileName={fileName}
            className="h-full"
            isDark={isDark}
          />
        </React.Suspense>
      )
    case "image":
      return (
        <img
          src={url}
          alt={fileName}
          className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
        />
      )
    case "video":
      return (
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          <React.Suspense fallback={<ViewerFallback />}>
            <LazyVideoPlayer src={url} controls width="100%" height="100%" />
          </React.Suspense>
        </div>
      )
    case "audio":
      return (
        <audio src={url} controls preload="metadata" className="w-full">
          Your browser does not support audio playback.
        </audio>
      )
    default:
      return <UnsupportedFile fileName={fileName} url={url} />
  }
}

function StarButton({
  isStarred,
  onToggleStar,
}: {
  isStarred: boolean
  onToggleStar: () => void
}) {
  const t = useTranslations("Viewer")
  const label = isStarred ? t("removeStar") : t("addStar")
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={label}
      title={label}
      onClick={onToggleStar}
      className={isStarred ? "text-amber-500 hover:text-amber-500" : undefined}
    >
      <AppIcon
        icon={FavouriteIcon}
        className={isStarred ? "fill-current" : undefined}
      />
    </Button>
  )
}

export function FileViewerDialog({
  file,
  url,
  open,
  onOpenChangeAction,
  isStarred = false,
  onToggleStarAction,
  onSaveAction,
}: {
  file: FileSystemFileItem | null
  url: string | null
  open: boolean
  onOpenChangeAction: (open: boolean) => void
  isStarred?: boolean
  onToggleStarAction?: () => void
  /** Omitted for read-only buckets, which hides the edit control. */
  onSaveAction?: (
    file: FileSystemFileItem,
    text: string,
    contentType: string | null
  ) => Promise<void>
}) {
  const t = useTranslations("Viewer")
  const tc = useTranslations("Common")
  const kind = file ? getFileKind(file) : "other"
  const fileName = file
    ? (file.name ?? file.path.split("/").pop() ?? file.path)
    : ""
  const codeViewerRef = React.useRef<CodeViewerHandle>(null)
  const [editing, setEditing] = React.useState(false)
  const [status, setStatus] = React.useState(CLEAN_STATUS)
  // What "Discard" in the confirmation leads to.
  const [pendingDiscard, setPendingDiscard] = React.useState<
    "close" | "exitEditing" | null
  >(null)
  const canEdit = kind === "text" && url !== null && onSaveAction !== undefined

  const close = () => {
    setPendingDiscard(null)
    setEditing(false)
    setStatus(CLEAN_STATUS)
    onOpenChangeAction(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (next) onOpenChangeAction(true)
    else if (status.dirty) setPendingDiscard("close")
    else close()
  }

  const exitEditing = () => {
    if (status.dirty) setPendingDiscard("exitEditing")
    else setEditing(false)
  }

  const discard = () => {
    if (pendingDiscard === "close") return close()
    codeViewerRef.current?.revert()
    setPendingDiscard(null)
    setEditing(false)
  }

  // These viewers render their own top toolbars, which would collide with the
  // dialog's default top-right close button. Give them a dedicated title bar
  // with the close control instead, and hide the built-in one.
  // Media gets a header bar (title + close) like the document viewers, and is
  // centered below it.
  const isMedia = kind === "image" || kind === "video" || kind === "audio"

  const body = url ? (
    <ViewerBody
      kind={kind}
      fileName={fileName}
      url={url}
      codeViewerRef={codeViewerRef}
      editing={editing}
      onSaveAction={
        onSaveAction && file
          ? (text, contentType) => onSaveAction(file, text, contentType)
          : undefined
      }
      onStatusChangeAction={setStatus}
    />
  ) : (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      {t("noUrl")}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {open && file ? (
        <DialogContent
          showCloseButton={kind === "other"}
          className={cn("overflow-hidden", DIALOG_CLASSNAMES[kind])}
        >
          <DialogTitle className="sr-only">{fileName}</DialogTitle>
          {kind === "other" ? (
            body
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              {/* This top bar owns the filename for every supported viewer,
                  plus search/download for text and the star toggle. */}
              <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {fileName}
                  </span>
                  {status.dirty ? (
                    <span
                      role="status"
                      aria-label={t("unsavedChanges")}
                      title={t("unsavedChanges")}
                      className="size-2 shrink-0 rounded-full bg-muted-foreground"
                    />
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canEdit && editing ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={status.saving}
                      onClick={exitEditing}
                    >
                      {tc("done")}
                    </Button>
                  ) : null}
                  {canEdit && editing ? (
                    <Button
                      size="sm"
                      loading={status.saving}
                      disabled={!status.dirty}
                      onClick={async () => {
                        if (await codeViewerRef.current?.save()) {
                          setEditing(false)
                        }
                      }}
                    >
                      {tc("save")}
                    </Button>
                  ) : null}
                  {canEdit && !editing ? (
                    <Button
                      aria-label={t("edit")}
                      title={t("edit")}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditing(true)}
                    >
                      {/* The pencil glyph is thin and diagonal; one step up
                          (with a lighter stroke) matches its neighbours. */}
                      <AppIcon
                        icon={Edit02Icon}
                        stroke={1.8}
                        className="size-5 sm:size-4.5"
                      />
                    </Button>
                  ) : null}
                  {onToggleStarAction ? (
                    <StarButton
                      isStarred={isStarred}
                      onToggleStar={onToggleStarAction}
                    />
                  ) : null}
                  {kind === "text" ? (
                    <Button
                      aria-label={t("search")}
                      title={t("search")}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => codeViewerRef.current?.toggleSearch()}
                    >
                      <AppIcon icon={Search01Icon} />
                    </Button>
                  ) : null}
                  {kind === "text" && url ? (
                    <Button
                      aria-label={t("download")}
                      title={t("download")}
                      size="icon-sm"
                      variant="ghost"
                      render={<a href={url} download={fileName} />}
                    >
                      <AppIcon icon={Download01Icon} />
                    </Button>
                  ) : null}
                  <DialogClose
                    aria-label={t("close")}
                    render={<Button size="icon" variant="ghost" />}
                  >
                    <AppIcon icon={Cancel01Icon} />
                  </DialogClose>
                </div>
              </div>
              <div
                className={
                  isMedia
                    ? "flex min-h-0 flex-1 items-center justify-center p-2"
                    : "min-h-0 flex-1"
                }
              >
                {body}
              </div>
            </div>
          )}
          <Dialog
            open={pendingDiscard !== null}
            onOpenChange={(next) => {
              if (!next) setPendingDiscard(null)
            }}
          >
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>{t("discardTitle")}</DialogTitle>
                <DialogDescription>
                  {t("discardDescription", { name: fileName })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPendingDiscard(null)}
                >
                  {t("keepEditing")}
                </Button>
                <Button variant="destructive" onClick={discard}>
                  {t("discard")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
