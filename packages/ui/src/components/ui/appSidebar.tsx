"use client";
import { SidebarBody, SidebarLink, SidebarTrigger, useSidebar } from "@workspace/ui/components/sidebar";
import { motion } from "motion/react";
import { Home, ScrollText, PanelLeft } from "lucide-react";

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
      <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-2 mb-8">
          <div className="flex items-center justify-between">
            <Logo />
            <OpenTrigger />
          </div>
          <ClosedTrigger />
        </div>
        <div className="flex flex-col gap-2">
          {links.map((link, idx) => (
            <SidebarLink key={idx} link={link} />
          ))}
        </div>
      </div>
      <div>
        {children}
      </div>
    </SidebarBody>
  );
}

const OpenTrigger = () => {
  const { open } = useSidebar();
  if (!open) return null;
  return (
    <SidebarTrigger className="hidden md:flex">
      <PanelLeft className="text-neutral-700 dark:text-neutral-200 h-5 w-5 shrink-0" />
    </SidebarTrigger>
  );
};

const ClosedTrigger = () => {
  const { open } = useSidebar();
  if (open) return null;
  return (
    <SidebarTrigger className="mx-auto mt-2 hidden md:block">
      <PanelLeft className="text-neutral-700 dark:text-neutral-200 h-5 w-5 shrink-0" />
    </SidebarTrigger>
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
