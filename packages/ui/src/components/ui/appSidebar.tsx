"use client";
import { SidebarBody, SidebarLink, SidebarTrigger, useSidebar } from "@workspace/ui/components/sidebar";
import { motion } from "motion/react";
import { Home, ScrollText, ChevronRight } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipPositioner,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { useState, useEffect } from "react";

interface AppSidebarProps {
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  children?: React.ReactNode;
}

export function AppSidebar({ children }: AppSidebarProps) {
  const links = [
    {
      label: "Home",
      href: "/",
      icon: (
        <Home className="text-neutral-700 dark:text-neutral-200 h-5 w-5 shrink-0" />
      ),
    },
    {
      label: "Changelog",
      href: "/changelog",
      icon: (
        <ScrollText className="text-neutral-700 dark:text-neutral-200 h-5 w-5 shrink-0" />
      ),
    },
  ];

  return (
    <SidebarBody className="justify-between gap-10">
      <ToggleHandle />
      <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-2 mb-8">
          <Logo />
        </div>
        <div className="flex flex-col gap-2">
          {links.map((link, idx) => (
            <SidebarLink key={idx} link={link} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {children}
      </div>
    </SidebarBody>
  );
}

const ToggleHandle = () => {
  const { open } = useSidebar();
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf("MAC") >= 0);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarTrigger
            className={cn(
              "absolute -right-3 top-10 z-50 hidden md:flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 shadow-sm transition-all hover:scale-110",
              open && "rotate-180"
            )}
          >
            <ChevronRight className="h-3 w-3 text-neutral-500 dark:text-neutral-400" />
          </SidebarTrigger>
        }
      />
      <TooltipPositioner side="right">
        <TooltipContent>
          <div className="flex items-center gap-2">
            <span>{open ? "Collapse" : "Expand"} Sidebar</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              <span className="text-xs">{isMac ? "⌘" : "Ctrl"}</span>B
            </kbd>
          </div>
        </TooltipContent>
      </TooltipPositioner>
    </Tooltip>
  );
};

export const Logo = () => {
  const { open, animate } = useSidebar();
  return (
    <a
      href="/"
      className="font-normal flex space-x-2 items-center text-sm text-black py-1 relative z-20"
    >
      <div className="h-5 w-6 bg-black dark:bg-white rounded-br-lg rounded-tr-sm rounded-tl-lg rounded-bl-sm shrink-0" />
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="font-medium text-black dark:text-white whitespace-pre"
      >
        Edward.
      </motion.span>
    </a>
  );
};

export const LogoIcon = () => {
  return (
    <a
      href="/"
      className="font-normal flex space-x-2 items-center text-sm text-black py-1 relative z-20"
    >
      <div className="h-5 w-6 bg-black dark:bg-white rounded-br-lg rounded-tr-sm rounded-tl-lg rounded-bl-sm shrink-0" />
    </a>
  );
};
