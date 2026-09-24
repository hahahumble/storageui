"use client"

import * as React from "react"
import { LanguageDescription } from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import {
  closeSearchPanel,
  openSearchPanel,
  search,
  searchPanelOpen,
} from "@codemirror/search"
import { EditorState, type Extension } from "@codemirror/state"
import { layer, RectangleMarker } from "@codemirror/view"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import { basicSetup, EditorView } from "codemirror"
import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"

import { Spinner } from "@/components/ui/spinner"

// CodeMirror's search/go-to-line panels are English by default; map the visible
// phrases per locale via the `phrases` facet (keyed by the original English).
const CODEMIRROR_PHRASES: Record<string, Record<string, string>> = {
  zh: {
    Find: "查找",
    Replace: "替换",
    next: "下一个",
    previous: "上一个",
    all: "全部",
    "match case": "区分大小写",
    "by word": "全字匹配",
    regexp: "正则表达式",
    replace: "替换",
    "replace all": "全部替换",
    close: "关闭",
    "current match": "当前匹配",
    "on line": "在行",
    "Go to line": "跳转到行",
    go: "跳转",
  },
}

const MAX_BYTES = 5_000_000 // Don't try to render absurdly large blobs.

const layoutTheme = EditorView.theme({
  "&": { height: "100%" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
    fontSize: "13px",
  },
  ".cm-content, .cm-content *": {
    WebkitTextFillColor: "currentColor",
  },
  ".cm-content::selection, .cm-content *::selection": {
    color: "currentColor !important",
    WebkitTextFillColor: "currentColor !important",
  },
  ".cm-panels-top": {
    borderBottom: "1px solid var(--color-border)",
  },
  ".cm-panel.cm-search": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
    padding: "8px 44px 8px 10px",
    backgroundColor: "var(--color-background)",
    color: "var(--color-foreground)",
    fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
  },
  ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label":
    {
      margin: "0",
    },
  ".cm-panel.cm-search .cm-textfield": {
    boxSizing: "border-box",
    width: "min(260px, 45vw)",
    height: "30px",
    padding: "0 9px",
    border: "1px solid var(--color-input)",
    borderRadius: "var(--radius-md)",
    outline: "none",
    backgroundColor: "var(--color-background)",
    color: "var(--color-foreground)",
    font: "inherit",
    fontSize: "13px",
  },
  ".cm-panel.cm-search .cm-textfield:focus": {
    borderColor: "var(--color-ring)",
    boxShadow:
      "0 0 0 2px color-mix(in srgb, var(--color-ring) 22%, transparent)",
  },
  ".cm-panel.cm-search .cm-button": {
    boxSizing: "border-box",
    height: "30px",
    padding: "0 9px",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-background)",
    color: "var(--color-foreground)",
    font: "inherit",
    fontSize: "12px",
    textTransform: "capitalize",
    cursor: "pointer",
  },
  ".cm-panel.cm-search .cm-button:hover": {
    backgroundColor: "var(--color-accent)",
  },
  ".cm-panel.cm-search label": {
    display: "inline-flex",
    height: "30px",
    alignItems: "center",
    gap: "4px",
    padding: "0 4px",
    color: "var(--color-muted-foreground)",
    fontSize: "12px",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  ".cm-panel.cm-search input[type=checkbox]": {
    appearance: "none",
    display: "inline-grid",
    width: "14px",
    height: "14px",
    flexShrink: "0",
    placeContent: "center",
    margin: "0",
    border: "1px solid var(--color-input)",
    borderRadius: "4px",
    outline: "none",
    backgroundColor: "var(--color-background)",
    color: "var(--color-primary-foreground)",
    cursor: "pointer",
  },
  ".cm-panel.cm-search input[type=checkbox]::before": {
    content: '""',
    width: "7px",
    height: "4px",
    borderBottom: "2px solid currentColor",
    borderLeft: "2px solid currentColor",
    transform: "translateY(-1px) rotate(-45deg) scale(0)",
    transition: "transform 100ms ease",
  },
  ".cm-panel.cm-search input[type=checkbox]:checked": {
    borderColor: "var(--color-primary)",
    backgroundColor: "var(--color-primary)",
  },
  ".cm-panel.cm-search input[type=checkbox]:checked::before": {
    transform: "translateY(-1px) rotate(-45deg) scale(1)",
  },
  ".cm-panel.cm-search input[type=checkbox]:hover": {
    borderColor: "var(--color-ring)",
  },
  ".cm-panel.cm-search input[type=checkbox]:focus-visible": {
    borderColor: "var(--color-ring)",
    boxShadow:
      "0 0 0 2px color-mix(in srgb, var(--color-ring) 22%, transparent)",
  },
  ".cm-panel.cm-search [name=close]": {
    position: "absolute",
    top: "50%",
    right: "9px",
    display: "flex",
    width: "28px",
    height: "28px",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    border: "0",
    borderRadius: "var(--radius-md)",
    transform: "translateY(-50%)",
    backgroundColor: "transparent",
    color: "var(--color-muted-foreground)",
    font: "inherit",
    fontSize: "20px",
    lineHeight: "1",
    cursor: "pointer",
  },
  ".cm-panel.cm-search [name=close]:hover": {
    backgroundColor: "var(--color-accent)",
    color: "var(--color-foreground)",
  },
  // Painted by `activeLineLayer` instead, so the tint sits under the selection.
  "& .cm-line.cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-searchMatch": {
    backgroundColor:
      "color-mix(in srgb, var(--color-warning) 28%, transparent)",
    outline:
      "1px solid color-mix(in srgb, var(--color-warning) 48%, transparent)",
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--color-info) 32%, transparent)",
    outline: "1px solid color-mix(in srgb, var(--color-info) 58%, transparent)",
  },
})

// Layers stack by registration order, so this must come after `basicSetup`'s
// selection layer to be drawn beneath it.
const activeLineLayer = [
  layer({
    above: false,
    class: "cm-activeLineLayer",
    markers(view) {
      const scroller = view.scrollDOM.getBoundingClientRect()
      const content = view.contentDOM.getBoundingClientRect()
      const left =
        (content.left - scroller.left) / view.scaleX + view.scrollDOM.scrollLeft
      const top =
        (view.documentTop - scroller.top) / view.scaleY +
        view.scrollDOM.scrollTop
      const width = view.contentDOM.clientWidth

      const seen = new Set<number>()
      const markers: RectangleMarker[] = []
      for (const range of view.state.selection.ranges) {
        const line = view.lineBlockAt(range.head)
        if (seen.has(line.from)) continue
        seen.add(line.from)
        markers.push(
          new RectangleMarker(
            "cm-activeLineBackground",
            left,
            top + line.top,
            width,
            line.height
          )
        )
      }
      return markers
    },
    update: (update) =>
      update.selectionSet ||
      update.docChanged ||
      update.viewportChanged ||
      update.geometryChanged,
  }),
  EditorView.baseTheme({
    "&light .cm-activeLineBackground": { backgroundColor: "#cceeff44" },
    "&dark .cm-activeLineBackground": { backgroundColor: "#36334280" },
  }),
]

async function languageExtension(fileName: string): Promise<Extension[]> {
  const description = LanguageDescription.matchFilename(languages, fileName)
  if (!description) return []
  try {
    const support = await description.load()
    return [support]
  } catch {
    return []
  }
}

export type CodeViewerHandle = {
  toggleSearch: () => void
}

export const CodeViewer = React.forwardRef<
  CodeViewerHandle,
  {
    url: string
    fileName: string
  }
>(function CodeViewer({ url, fileName }, ref) {
  const t = useTranslations("Viewer")
  const locale = useLocale()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const [text, setText] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const hostRef = React.useRef<HTMLDivElement>(null)
  const viewRef = React.useRef<EditorView | null>(null)

  React.useImperativeHandle(ref, () => ({
    toggleSearch: () => {
      const view = viewRef.current

      if (!view) return

      if (searchPanelOpen(view.state)) closeSearchPanel(view)
      else openSearchPanel(view)
    },
  }))

  // Fetch the file's contents once per url.
  React.useEffect(() => {
    let cancelled = false
    setText(null)
    setError(null)

    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }
        const size = Number(response.headers.get("content-length") ?? "0")
        if (size > MAX_BYTES) {
          throw new Error(t("codeTooLarge"))
        }
        const body = await response.text()
        if (!cancelled) setText(body)
      } catch (err) {
        if (cancelled || controller.signal.aborted) return
        setError(err instanceof Error ? err.message : t("codeLoadFailed"))
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [url, t])

  // (Re)build the editor when the text or theme changes.
  React.useEffect(() => {
    if (text === null || !hostRef.current) return

    let cancelled = false
    const host = hostRef.current

    void (async () => {
      const langExt = await languageExtension(fileName)
      if (cancelled) return

      viewRef.current?.destroy()
      viewRef.current = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: text,
          extensions: [
            basicSetup,
            search({ top: true }),
            ...(CODEMIRROR_PHRASES[locale]
              ? [EditorState.phrases.of(CODEMIRROR_PHRASES[locale])]
              : []),
            isDark ? githubDark : githubLight,
            layoutTheme,
            activeLineLayer,
            EditorState.readOnly.of(true),
            EditorView.lineWrapping,
            ...langExt,
          ],
        }),
      })
    })()

    return () => {
      cancelled = true
      viewRef.current?.destroy()
      viewRef.current = null
    }
  }, [text, isDark, fileName, locale])

  return (
    <div className="relative h-full min-h-0">
      {error ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : text === null ? (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div ref={hostRef} className="h-full overflow-hidden" />
      )}
    </div>
  )
})
