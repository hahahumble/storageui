"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import type { UploadTask } from "@/lib/storage/hooks/use-uploads"
import { cn } from "@/lib/utils"
import { formatByteSize } from "@/components/explorer/internals"
import {
  AppIcon,
  Cancel01Icon,
  CancelCircleIcon,
  CheckmarkCircle01Icon,
  File01Icon,
} from "@/components/foundations/icons"

export function UploadProgressPanel({
  tasks,
  activeCount,
  onDismissAction,
  onClearAction,
}: {
  tasks: UploadTask[]
  activeCount: number
  onDismissAction: (id: string) => void
  onClearAction: () => void
}) {
  const t = useTranslations("Upload")
  if (tasks.length === 0) return null

  const allDone = activeCount === 0
  const title =
    activeCount > 0 ? t("uploading", { count: activeCount }) : t("complete")

  return (
    <div className="fixed right-4 bottom-4 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="truncate text-sm font-medium">{title}</span>
        <button
          type="button"
          onClick={onClearAction}
          disabled={!allDone}
          className={cn(
            "rounded-sm text-muted-foreground transition-colors hover:text-foreground",
            !allDone && "pointer-events-none opacity-40"
          )}
          aria-label={t("dismissCompleted")}
        >
          <AppIcon icon={Cancel01Icon} className="size-4" />
        </button>
      </div>

      <ul className="max-h-72 overflow-y-auto p-2">
        {tasks.map((task) => {
          const pct =
            task.total > 0
              ? Math.min(100, Math.round((task.loaded / task.total) * 100))
              : task.status === "done"
                ? 100
                : 0
          // Mid-upload the transferred amount is the useful half; once it is
          // over only the total still says anything.
          const size =
            task.status === "uploading"
              ? `${formatByteSize(task.loaded)} / ${formatByteSize(task.total)}`
              : formatByteSize(task.total)
          return (
            <li key={task.id} className="rounded-md px-1.5 py-1.5">
              <div className="flex items-center gap-2">
                <AppIcon
                  icon={
                    task.status === "done"
                      ? CheckmarkCircle01Icon
                      : task.status === "error"
                        ? CancelCircleIcon
                        : File01Icon
                  }
                  className={cn(
                    "size-4 shrink-0",
                    task.status === "done" && "text-emerald-500",
                    task.status === "error" && "text-destructive",
                    task.status === "uploading" && "text-muted-foreground"
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {task.name}
                </span>
                {task.status === "uploading" ? (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {pct}%
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDismissAction(task.id)}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={t("dismiss")}
                  >
                    <AppIcon icon={Cancel01Icon} className="size-3.5" />
                  </button>
                )}
              </div>
              {task.status === "uploading" ? (
                // Indented to the same column as the name and the byte count;
                // the padding goes on a wrapper so the track itself starts
                // there rather than the fill floating inside a full-width one.
                <div className="mt-1.5 pl-6">
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-[width]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              ) : null}
              {size ? (
                <p className="mt-1 pl-6 text-xs text-muted-foreground tabular-nums">
                  {size}
                </p>
              ) : null}
              {task.status === "error" && task.error ? (
                <p className="mt-1 pl-6 text-xs text-destructive">
                  {task.error}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
