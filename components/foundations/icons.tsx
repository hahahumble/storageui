/**
 * Icon adapter — the project's icons are provided by Tabler Icons
 * (`@tabler/icons-react`). This module re-exports the Tabler glyphs under the
 * names used across the codebase and exposes `AppIcon`, a small renderer so
 * call sites can keep passing the icon as a prop:
 *
 *   <AppIcon icon={Search01Icon} className="size-4" />
 *
 * Tabler is stroke-based: control thickness with the `stroke` prop
 * (e.g. `stroke={1.5}`); default is 2.
 */
import type { Icon, IconProps } from "@tabler/icons-react"

export function AppIcon({
  icon: IconComponent,
  ...props
}: { icon: Icon } & IconProps) {
  return <IconComponent {...props} />
}

export {
  IconAlertTriangle as Alert01Icon,
  IconChevronDown as ArrowDown01Icon,
  IconChevronLeft as ArrowLeft01Icon,
  IconChevronRight as ArrowRight01Icon,
  IconChevronUp as ArrowUp01Icon,
  IconArrowsSort as ArrowUpDownIcon,
  IconCalendar as Calendar03Icon,
  IconX as Cancel01Icon,
  IconCircleX as CancelCircleIcon,
  IconCircleCheck as CheckmarkCircle01Icon,
  IconChevronDown as ChevronDown,
  IconChevronUp as ChevronUp,
  IconClock as Clock01Icon,
  IconCloud as CloudServerIcon,
  IconMessageCircle as Comment01Icon,
  IconTrash as Delete02Icon,
  IconDownload as Download01Icon,
  IconPencil as Edit02Icon,
  IconExternalLink as ExternalLinkIcon,
  IconEye as EyeIcon,
  IconEyeOff as EyeOffIcon,
  IconStar as FavouriteIcon,
  IconFile as File01Icon,
  IconFilter as FilterIcon,
  IconFolder as Folder01Icon,
  IconFolders as FolderLibraryIcon,
  IconFolderSymlink as MoveIcon,
  IconPhoto as GalleryThumbnailsIcon,
  IconLayoutGrid as GridViewIcon,
  IconServer as HardDriveIcon,
  IconPhoto as Image01Icon,
  IconInfoCircle as InformationCircleIcon,
  IconLayoutColumns as LayoutThreeColumnIcon,
  IconList as LeftToRightListBulletIcon,
  IconLoader2 as Loading03Icon,
  IconLogout as LogoutIcon,
  IconCircleMinus as MinusSignCircleIcon,
  IconMoon as Moon02Icon,
  IconDots as MoreHorizontalIcon,
  IconCirclePlus as PlusSignCircleIcon,
  IconRotateClockwise as RotateClockwiseIcon,
  IconSearch as Search01Icon,
  IconSettings as Settings01Icon,
  IconShare as Share08Icon,
  IconLayoutSidebar as SidebarLeftIcon,
  IconCheck as Tick02Icon,
  IconUpload as Upload01Icon,
} from "@tabler/icons-react"
