import {
  IconDots,
  IconLayoutDashboard,
  IconX,
  type Icon,
} from "@tabler/icons-react"
import { cn } from "cn"

import { BekaMark } from "@/components/beka-mark"
import { Button, buttonVariants } from "@/components/ui/button"
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
  useSidebar,
} from "@/components/ui/sidebar"

interface NavItem {
  href: string
  label: string
  /** The page's full name, when the label is shortened to fit the tab bar. */
  name?: string
  /** A shorter tab label for narrow phones. */
  short?: string
  icon: Icon
}

const overview: NavItem = {
  href: "/",
  label: "Dashboard",
  icon: IconLayoutDashboard,
}

/** The sidebar's groups: where money comes from and goes, then what you hold. */
const groups: { label: string; items: NavItem[] }[] = []

const tools: NavItem[] = []

/** The pages on the phone's tab bar; the rest open from More. */
const tabs: NavItem[] = [{ ...overview, short: "Home" }]

const allItems = [overview, ...groups.flatMap((g) => g.items), ...tools]

/** Whether `path` is `href` or a page under it. */
function isCurrent(href: string, path: string): boolean {
  return href === "/"
    ? path === "/"
    : path === href || path.startsWith(`${href}/`)
}

function NavLink({ item, path }: { item: NavItem; path: string }) {
  const current = isCurrent(item.href, path)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={current}
        tooltip={item.label}
        render={
          <a href={item.href} aria-current={current ? "page" : undefined} />
        }
      >
        <item.icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar({ path }: { path: string }) {
  const { isMobile, setOpenMobile } = useSidebar()
  return (
    // On phones the menu opens from the right, beside the More tab.
    <Sidebar collapsible="icon" side={isMobile ? "right" : "left"}>
      <nav aria-label="Main" className="contents">
        <SidebarHeader className="pt-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                className="gap-3"
                render={<a href="/" />}
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <BekaMark className="size-5" />
                </div>
                <span className="font-heading text-xl/none">Beka</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {isMobile && (
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setOpenMobile(false)}>
                  <IconX />
                  <span>Close menu</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <NavLink item={overview} path={path} />
            </SidebarMenu>
          </SidebarGroup>
          {groups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-sm">
                {group.label}
              </SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} path={path} />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="pb-4">
          <SidebarMenu>
            {tools.map((item) => (
              <NavLink key={item.href} item={item} path={path} />
            ))}
          </SidebarMenu>
        </SidebarFooter>
      </nav>
      <SidebarRail />
    </Sidebar>
  )
}

/** The phone's tab bar: the pages people check most, and More for the rest. */
export function MobileTabs({ path }: { path: string }) {
  const { setOpenMobile } = useSidebar()
  const inTabs = tabs.some((tab) => isCurrent(tab.href, path))
  // Off the tab bar, More is lit and names the page you're on for screen readers.
  const here = inTabs
    ? undefined
    : allItems.find((item) => isCurrent(item.href, path))
  const tab = (current: boolean) =>
    cn(
      buttonVariants({ variant: "ghost" }),
      "h-auto min-w-0 flex-1 basis-0 flex-col gap-1 rounded-lg px-0.5 py-2 text-sm",
      current ? "bg-muted font-medium text-primary" : "text-muted-foreground"
    )
  return (
    <nav
      aria-label="Pages"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t bg-background px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
    >
      {tabs.map((item) => {
        const current = isCurrent(item.href, path)
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            aria-label={item.short ? item.label : item.name}
            className={tab(current)}
          >
            <item.icon className="size-5" />
            {/* Below 360px only the icons fit; the label stays for screen readers. */}
            {item.short ? (
              <>
                <span className="max-[29rem]:hidden">{item.label}</span>
                <span className="min-[29rem]:hidden">{item.short}</span>
              </>
            ) : (
              <span>{item.label}</span>
            )}
          </a>
        )
      })}
      <Button
        variant="ghost"
        onClick={() => setOpenMobile(true)}
        className={tab(Boolean(here))}
        aria-label={here ? `More pages, now on ${here.label}` : "More pages"}
      >
        <IconDots className="size-5" />
        <span>More</span>
      </Button>
    </nav>
  )
}
