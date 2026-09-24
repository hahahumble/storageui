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
import {
  Compartment,
  EditorState,
  type Extension,
  type Text,
} from "@codemirror/state"
import { keymap, layer, RectangleMarker } from "@codemirror/view"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import { basicSetup, EditorView } from "codemirror"
import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { toast } from "sonner"

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

const themeCompartment = new Compartment()
const phrasesCompartment = new Compartment()
const readOnlyCompartment = new Compartment()
const languageCompartment = new Compartment()

export type CodeViewerHandle = {
  toggleSearch: () => void
  /** Resolves to whether the editor is clean afterwards. */
  save: () => Promise<boolean>
  /** Replace the edits with the last saved contents. */
  revert: () => void
}

export type CodeViewerStatus = { dirty: boolean; saving: boolean }

export const CodeViewer = React.forwardRef<
  CodeViewerHandle,
  {
    url: string
    fileName: string
    editable?: boolean
    onSaveAction?: (text: string, contentType: string | null) => Promise<void>
    onStatusChangeAction?: (status: CodeViewerStatus) => void
  }
>(function CodeViewer(
  { url, fileName, editable = false, onSaveAction, onStatusChangeAction },
  ref
) {
  const t = useTranslations("Viewer")
  const locale = useLocale()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const [text, setText] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [view, setView] = React.useState<EditorView | null>(null)
  const [dirty, setDirty] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const hostRef = React.useRef<HTMLDivElement>(null)
  // Written back on save so the object keeps the type it was stored with.
  const contentTypeRef = React.useRef<string | null>(null)
  const savedDocRef = React.useRef<Text | null>(null)
  const savingRef = React.useRef(false)
  const onSaveRef = React.useRef(onSaveAction)
  const onStatusChangeRef = React.useRef(onStatusChangeAction)

  const save = React.useCallback(
    async (target: EditorView): Promise<boolean> => {
      const onSave = onSaveRef.current
      const doc = target.state.doc
      if (!onSave || savingRef.current || !savedDocRef.current) return false
      if (doc.eq(savedDocRef.current)) return true

      savingRef.current = true
      setSaving(true)
      try {
        await onSave(doc.toString(), contentTypeRef.current)
        savedDocRef.current = doc
        // Typing can continue while the upload is in flight.
        const clean = target.state.doc.eq(doc)
        setDirty(!clean)
        toast.success(t("saved"))
        return clean
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("saveFailed"))
        return false
      } finally {
        savingRef.current = false
        setSaving(false)
      }
    },
    [t]
  )
  const saveRef = React.useRef(save)

  React.useEffect(() => {
    onSaveRef.current = onSaveAction
    onStatusChangeRef.current = onStatusChangeAction
    saveRef.current = save
  })

  React.useImperativeHandle(ref, () => ({
    toggleSearch: () => {
      if (!view) return

      if (searchPanelOpen(view.state)) closeSearchPanel(view)
      else openSearchPanel(view)
    },
    save: async () => (view ? save(view) : false),
    revert: () => {
      const saved = savedDocRef.current
      if (!view || !saved) return
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: saved },
      })
    },
  }))

  React.useEffect(() => {
    onStatusChangeRef.current?.({ dirty, saving })
  }, [dirty, saving])

  React.useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  // Fetch the file's contents once per url.
  React.useEffect(() => {
    let cancelled = false
    setText(null)
    setError(null)

    const controller = new AbortController()
    void (async () => {
      try {
        // `no-store`: a stable URL (the WebDAV proxy) would otherwise serve
        // the pre-save contents from the HTTP cache on reopen.
        const response = await fetch(url, {
          signal: controller.signal,
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }
        const size = Number(response.headers.get("content-length") ?? "0")
        if (size > MAX_BYTES) {
          throw new Error(t("codeTooLarge"))
        }
        const body = await response.text()
        if (cancelled) return
        contentTypeRef.current = response.headers.get("content-type")
        setText(body)
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

  // Built once per loaded text. Theme, locale, read-only and language are
  // swapped through compartments below, so toggling them keeps the edits.
  React.useLayoutEffect(() => {
    const host = hostRef.current
    if (text === null || !host) return

    const next = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: text,
        extensions: [
          basicSetup,
          search({ top: true }),
          phrasesCompartment.of([]),
          themeCompartment.of([]),
          layoutTheme,
          activeLineLayer,
          readOnlyCompartment.of(EditorState.readOnly.of(true)),
          EditorView.lineWrapping,
          languageCompartment.of([]),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: (target) => {
                void saveRef.current(target)
                return true
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || !savedDocRef.current) return
            setDirty(!update.state.doc.eq(savedDocRef.current))
          }),
        ],
      }),
    })
    savedDocRef.current = next.state.doc
    setDirty(false)
    setView(next)

    return () => {
      next.destroy()
      setView(null)
    }
  }, [text])

  React.useLayoutEffect(() => {
    view?.dispatch({
      effects: themeCompartment.reconfigure(isDark ? githubDark : githubLight),
    })
  }, [view, isDark])

  React.useLayoutEffect(() => {
    const phrases = CODEMIRROR_PHRASES[locale]
    view?.dispatch({
      effects: phrasesCompartment.reconfigure(
        phrases ? EditorState.phrases.of(phrases) : []
      ),
    })
  }, [view, locale])

  React.useLayoutEffect(() => {
    if (!view) return
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(
        EditorState.readOnly.of(!editable)
      ),
    })
    if (editable) view.focus()
  }, [view, editable])

  React.useEffect(() => {
    if (!view) return
    let cancelled = false
    void languageExtension(fileName).then((extension) => {
      if (cancelled) return
      view.dispatch({ effects: languageCompartment.reconfigure(extension) })
    })
    return () => {
      cancelled = true
    }
  }, [view, fileName])

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
