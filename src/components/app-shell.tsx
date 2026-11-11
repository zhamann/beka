import { actions } from "astro:actions"
import { useEffect } from "react"
import { toast } from "sonner"

import { AppSidebar, MobileTabs } from "@/components/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { reloadWith, takeFlash } from "@/lib/reload"

type Action = (input: unknown) => Promise<{ error?: { message: string } }>

/** Shows the message a change left before the page reloaded, with its Undo. */
function Flash() {
  useEffect(() => {
    const flash = takeFlash()
    if (!flash) return
    const { undo } = flash
    toast.success(flash.message, {
      duration: undo ? 10_000 : undefined,
      action: undo && {
        label: "Undo",
        onClick: async () => {
          const call = (actions as unknown as Record<string, Action>)[
            undo.action
          ]
          const { error } = await call(undo.input)
          if (error) toast.error(error.message)
          else reloadWith("Undone")
        },
      },
    })
  }, [])
  return null
}

/**
 * Starts tablets with the sidebar folded to icons, so pages get the width;
 * once someone opens or closes it, their choice is kept in a cookie.
 */
function NarrowDefault({ remembered }: { remembered: boolean }) {
  const { setOpen } = useSidebar()
  useEffect(() => {
    if (!remembered && matchMedia("(max-width: 1023px)").matches) setOpen(false)
  }, [remembered, setOpen])
  return null
}

/**
 * The layout every page renders inside: the sidebar on tablets and desktops,
 * a tab bar along the bottom on phones.
 */
export function AppShell({
  path,
  sidebarOpen,
  sidebarRemembered,
  canSignOut,
  children,
}: {
  path: string
  sidebarOpen: boolean
  /** Whether someone has opened or closed the sidebar on this device. */
  sidebarRemembered: boolean
  /** Whether a household password is set, so there's a session to end. */
  canSignOut: boolean
  children?: React.ReactNode
}) {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <NarrowDefault remembered={sidebarRemembered} />
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>
        <AppSidebar path={path} canSignOut={canSignOut} />
        <SidebarInset className="min-w-0">
          <div className="hidden px-4 pt-3 md:block">
            <SidebarTrigger aria-label="Toggle sidebar" />
          </div>
          {children}
          <MobileTabs path={path} />
          <Toaster
            mobileOffset={{
              bottom: "calc(5.5rem + env(safe-area-inset-bottom))",
            }}
          />
          <Flash />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
