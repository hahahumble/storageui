"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { siteConfig } from "@/lib/config/site"
import { useConnections } from "@/lib/store/connection-store"
import { useNavStore, type BrowseSection } from "@/lib/store/nav-store"
import { useUploadUiStore } from "@/lib/store/upload-ui-store"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AppIcon,
  Clock01Icon,
  Edit02Icon,
  FavouriteIcon,
  FolderLibraryIcon,
  HardDriveIcon,
  LogoutIcon,
  PlusSignCircleIcon,
  Settings01Icon,
  Upload01Icon,
} from "@/components/foundations/icons"
import { Logo, LogoText } from "@/components/foundations/logo"
import { SettingsDialog } from "@/components/settings/settings-dialog"
import { isAuthEnabledAction, logoutAction } from "@/app/actions/auth"

type BrowseItem = {
  labelKey: "allFiles" | "recents" | "starred"
  icon: typeof FolderLibraryIcon
  section: BrowseSection
}

const BROWSE: BrowseItem[] = [
  { labelKey: "allFiles", icon: FolderLibraryIcon, section: "all" },
  { labelKey: "recents", icon: Clock01Icon, section: "recents" },
  { labelKey: "starred", icon: FavouriteIcon, section: "starred" },
]

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations("Sidebar")
  const [isSettingsOpen, setSettingsOpen] = React.useState(false)
  const [authEnabled, setAuthEnabled] = React.useState(false)
  React.useEffect(() => {
    isAuthEnabledAction().then(setAuthEnabled, () => {})
  }, [])
  const {
    connections,
    activeConnection,
    hasHydrated,
    setActiveConnection,
    openAddDialog,
    openEditDialog,
  } = useConnections()
  const pickFiles = useUploadUiStore((state) => state.pickFiles)
  const section = useNavStore((state) => state.section)
  const setSection = useNavStore((state) => state.setSection)

  return (
    <>
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader>
          <div className="flex h-8 items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <LogoText
              title={siteConfig.name}
              className="h-6 w-auto text-foreground group-data-[collapsible=icon]:hidden"
            />
            <Logo
              title={siteConfig.name}
              className="hidden size-5 text-foreground group-data-[collapsible=icon]:block"
            />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <Button
                  variant="default"
                  title={
                    activeConnection?.readOnly
                      ? t("readOnlyTooltip")
                      : t("uploadFiles")
                  }
                  disabled={!activeConnection || activeConnection.readOnly}
                  onClick={() => pickFiles?.()}
                  className="w-full justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                >
                  <AppIcon icon={Upload01Icon} />
                  <span className="group-data-[collapsible=icon]:hidden">
                    {t("upload")}
                  </span>
                </Button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>{t("browse")}</SidebarGroupLabel>
            <SidebarMenu>
              {BROWSE.map((item) => (
                <SidebarMenuItem key={item.section}>
                  <SidebarMenuButton
                    isActive={item.section === section && !!activeConnection}
                    tooltip={t(item.labelKey)}
                    onClick={() => setSection(item.section)}
                  >
                    <AppIcon icon={item.icon} />
                    <span>{t(item.labelKey)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>{t("connections")}</SidebarGroupLabel>
            <SidebarMenu>
              {!hasHydrated ? (
                ["w-24", "w-32", "w-20"].map((width, index) => (
                  <SidebarMenuItem key={index}>
                    <div className="flex h-8 items-center gap-2 rounded-lg px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
                      <Skeleton className="size-4 shrink-0 rounded" />
                      <Skeleton
                        className={`${width} h-4 group-data-[collapsible=icon]:hidden`}
                      />
                    </div>
                  </SidebarMenuItem>
                ))
              ) : (
                <>
                  {connections.map((connection) => (
                    <SidebarMenuItem key={connection.id}>
                      <SidebarMenuButton
                        isActive={connection.id === activeConnection?.id}
                        tooltip={connection.endpoint || connection.bucket}
                        onClick={() => {
                          setActiveConnection(connection.id)
                          setSection("all")
                        }}
                      >
                        <AppIcon icon={HardDriveIcon} />
                        <span className="truncate">{connection.name}</span>
                        {connection.readOnly || connection.source === "env" ? (
                          <div className="ms-auto flex shrink-0 items-center gap-1 group-data-[collapsible=icon]:hidden">
                            {connection.readOnly ? (
                              <span className="rounded bg-muted px-1 text-[0.625rem] tracking-wide text-muted-foreground uppercase">
                                {t("readOnly")}
                              </span>
                            ) : null}
                            {connection.source === "env" ? (
                              <span className="rounded bg-muted px-1 text-[0.625rem] tracking-wide text-muted-foreground uppercase">
                                env
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </SidebarMenuButton>
                      {connection.source !== "env" ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          data-sidebar="menu-action"
                          aria-label={t("editConnection")}
                          title={t("editConnection")}
                          onClick={() => openEditDialog(connection)}
                          className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 group-data-[collapsible=icon]:hidden focus-visible:opacity-100"
                        >
                          <AppIcon icon={Edit02Icon} />
                        </Button>
                      ) : null}
                    </SidebarMenuItem>
                  ))}
                  {connections.length === 0 ? (
                    <SidebarMenuItem>
                      <span className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                        {t("noConnections")}
                      </span>
                    </SidebarMenuItem>
                  ) : null}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip={t("addConnection")}
                      onClick={openAddDialog}
                    >
                      <AppIcon icon={PlusSignCircleIcon} />
                      <span>{t("addConnection")}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={t("settings")}
                onClick={() => setSettingsOpen(true)}
              >
                <AppIcon icon={Settings01Icon} />
                <span>{t("settings")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {authEnabled ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={t("signOut")}
                  onClick={() => void logoutAction()}
                >
                  <AppIcon icon={LogoutIcon} />
                  <span>{t("signOut")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>
      <SettingsDialog
        open={isSettingsOpen}
        onOpenChangeAction={setSettingsOpen}
      />
    </>
  )
}
