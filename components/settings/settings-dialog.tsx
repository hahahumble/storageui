"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { localeNames, locales, type Locale } from "@/i18n/config"
import { version } from "@/package.json"
import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"

import { siteConfig } from "@/lib/config/site"
import {
  usePreferencesStore,
  type TimeFormat,
} from "@/lib/store/preferences-store"
import { useIsMobile } from "@/hooks/use-media-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { AppIcon, ExternalLinkIcon } from "@/components/foundations/icons"
import { Logo } from "@/components/foundations/logo"
import { setLocale } from "@/app/actions/locale"

const THEME_OPTIONS = [
  { labelKey: "themeSystem", value: "system" },
  { labelKey: "themeLight", value: "light" },
  { labelKey: "themeDark", value: "dark" },
] as const

const TIME_FORMAT_OPTIONS: Array<{
  labelKey: "timeFormat12" | "timeFormat24"
  value: TimeFormat
}> = [
  { labelKey: "timeFormat12", value: "12h" },
  { labelKey: "timeFormat24", value: "24h" },
]

type SettingsDialogProps = {
  open: boolean
  onOpenChangeAction: (open: boolean) => void
}

export function SettingsDialog({
  open,
  onOpenChangeAction,
}: SettingsDialogProps) {
  const t = useTranslations("Settings")
  const locale = useLocale() as Locale
  const router = useRouter()
  const [isLocalePending, startLocaleTransition] = React.useTransition()
  const { theme, setTheme } = useTheme()
  const isMobile = useIsMobile()
  const showFileExtensions = usePreferencesStore(
    (state) => state.showFileExtensions
  )
  const showImagePreviews = usePreferencesStore(
    (state) => state.showImagePreviews
  )
  const setShowFileExtensions = usePreferencesStore(
    (state) => state.setShowFileExtensions
  )
  const setShowImagePreviews = usePreferencesStore(
    (state) => state.setShowImagePreviews
  )
  const showHiddenFiles = usePreferencesStore((state) => state.showHiddenFiles)
  const setShowHiddenFiles = usePreferencesStore(
    (state) => state.setShowHiddenFiles
  )
  const timeFormat = usePreferencesStore((state) => state.timeFormat)
  const setTimeFormat = usePreferencesStore((state) => state.setTimeFormat)
  const directClientRequests = usePreferencesStore(
    (state) => state.directClientRequests
  )
  const setDirectClientRequests = usePreferencesStore(
    (state) => state.setDirectClientRequests
  )

  function changeLocale(next: Locale) {
    if (next === locale) return
    startLocaleTransition(async () => {
      await setLocale(next)
      router.refresh()
    })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      {open ? (
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <DialogPanel className="pt-2">
            <Tabs
              className="h-80 w-full gap-5"
              defaultValue="general"
              orientation={isMobile ? "horizontal" : "vertical"}
              size={isMobile ? "sm" : "default"}
            >
              <TabsList
                className={
                  isMobile ? "shrink-0 self-start" : "w-36 shrink-0 self-start"
                }
              >
                <TabsTab value="general">{t("tabGeneral")}</TabsTab>
                <TabsTab value="advanced">{t("tabAdvanced")}</TabsTab>
                <TabsTab value="about">{t("tabAbout")}</TabsTab>
              </TabsList>

              <TabsPanel
                value="general"
                className="min-h-0 min-w-0 overflow-y-auto pe-1"
              >
                <div className="divide-y">
                  <div className="flex items-center justify-between gap-6 pb-4 first:pt-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t("appearance")}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("appearanceHint")}
                      </p>
                    </div>
                    <Select
                      value={theme ?? "system"}
                      onValueChange={(value) => setTheme(String(value))}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue>
                          {(() => {
                            const option = THEME_OPTIONS.find(
                              (item) => item.value === (theme ?? "system")
                            )
                            return option ? t(option.labelKey) : null
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {THEME_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {t(option.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-6 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t("language")}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("languageHint")}
                      </p>
                    </div>
                    <Select
                      value={locale}
                      onValueChange={(value) => changeLocale(value as Locale)}
                      disabled={isLocalePending}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue>{localeNames[locale]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {locales.map((option) => (
                          <SelectItem key={option} value={option}>
                            {localeNames[option]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-6 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t("timeFormat")}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("timeFormatHint")}
                      </p>
                    </div>
                    <Select
                      value={timeFormat}
                      onValueChange={(value) =>
                        setTimeFormat(value as TimeFormat)
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue>
                          {t(
                            TIME_FORMAT_OPTIONS.find(
                              (option) => option.value === timeFormat
                            )?.labelKey ?? "timeFormat12"
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_FORMAT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {t(option.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsPanel>

              <TabsPanel
                value="advanced"
                className="min-h-0 min-w-0 overflow-y-auto pe-1"
              >
                <div className="divide-y">
                  <label className="flex cursor-pointer items-center justify-between gap-6 pb-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {t("showImagePreviews")}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("showImagePreviewsHint")}
                      </p>
                    </div>
                    <Switch
                      checked={showImagePreviews}
                      onCheckedChange={setShowImagePreviews}
                    />
                  </label>

                  <label className="flex cursor-pointer items-center justify-between gap-6 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {t("showExtensions")}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("showExtensionsHint")}
                      </p>
                    </div>
                    <Switch
                      checked={showFileExtensions}
                      onCheckedChange={setShowFileExtensions}
                    />
                  </label>

                  <label className="flex cursor-pointer items-center justify-between gap-6 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {t("showHiddenFiles")}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("showHiddenFilesHint")}
                      </p>
                    </div>
                    <Switch
                      checked={showHiddenFiles}
                      onCheckedChange={setShowHiddenFiles}
                    />
                  </label>

                  <label className="flex cursor-pointer items-center justify-between gap-6 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {t("directClientRequests")}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("directClientRequestsHint")}
                      </p>
                    </div>
                    <Switch
                      checked={directClientRequests}
                      onCheckedChange={setDirectClientRequests}
                    />
                  </label>
                </div>
              </TabsPanel>

              <TabsPanel
                value="about"
                className="min-h-0 min-w-0 overflow-y-auto pe-1"
              >
                <div className="flex items-center gap-3 border-b pb-4">
                  <Logo className="h-10 w-auto shrink-0 text-foreground" />
                  <div className="min-w-0">
                    <p className="text-base font-semibold">{siteConfig.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("appDescription")}
                    </p>
                  </div>
                </div>

                <dl className="divide-y text-sm">
                  <div className="flex items-center justify-between py-3">
                    <dt className="text-muted-foreground">{t("version")}</dt>
                    <dd>{version}</dd>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <dt className="text-muted-foreground">{t("license")}</dt>
                    <dd>Apache-2.0</dd>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <dt className="text-muted-foreground">{t("website")}</dt>
                    <dd>
                      <a
                        href={siteConfig.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        storageui.dev
                        <AppIcon icon={ExternalLinkIcon} className="size-3.5" />
                      </a>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <dt className="text-muted-foreground">{t("github")}</dt>
                    <dd>
                      <a
                        href={siteConfig.githubUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        hahahumble/storageui
                        <AppIcon icon={ExternalLinkIcon} className="size-3.5" />
                      </a>
                    </dd>
                  </div>
                </dl>
              </TabsPanel>
            </Tabs>
          </DialogPanel>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
