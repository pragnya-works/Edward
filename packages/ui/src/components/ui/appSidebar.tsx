import { Calendar, Home, Inbox, Search, Settings } from "lucide-react"
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@workspace/ui/components/sidebar"

const items = [
    {
        title: "Home",
        url: "#",
        icon: Home,
    },
    {
        title: "Inbox",
        url: "#",
        icon: Inbox,
    },
    {
        title: "Calendar",
        url: "#",
        icon: Calendar,
    },
    {
        title: "Search",
        url: "#",
        icon: Search,
    },
    {
        title: "Settings",
        url: "#",
        icon: Settings,
    },
]

interface AppSidebarProps {
    LinkComponent?: React.ComponentType<{ href: string; children: React.ReactNode; className?: string }>;
}

export function AppSidebar({ LinkComponent }: AppSidebarProps = {}) {
    const Link = LinkComponent || (({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
        <a href={href} className={className}>
            {children}
        </a>
    ));

    return (
        <Sidebar collapsible="icon">
            <SidebarContent>
                <SidebarGroup>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild>
                                <Link href="#" className="cursor-default pointer-events-none justify-start">
                                    <span className="text-xl font-bold group-data-[collapsible=icon]:hidden">Edward.</span>
                                    <span className="text-lg font-bold hidden group-data-[collapsible=icon]:block">E.</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        {items.map((item) => (
                            <SidebarMenuItem key={item.title}>
                                <SidebarMenuButton asChild tooltip={item.title}>
                                    <Link href={item.url}>
                                        <item.icon />
                                        <span>{item.title}</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    )
}