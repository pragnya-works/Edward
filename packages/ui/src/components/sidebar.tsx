"use client";
import { cn } from "@edward/ui/lib/utils";
import { useState, createContext, useContext, useEffect, useMemo } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { IconMenu2, IconX } from "@tabler/icons-react";

interface Links {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "b") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setOpen]);

  const value = useMemo(() => ({ open, setOpen, animate }), [open, setOpen, animate]);

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props: React.ComponentProps<typeof m.div>) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<"div">)} />
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof m.div>) => {
  const { open, animate } = useSidebar();
  return (
    <LazyMotion features={domAnimation}>
      <m.div
        className={cn(
          "h-full px-4 py-4 hidden  md:flex md:flex-col bg-neutral-100 dark:bg-neutral-800 w-75 shrink-0 relative",
          className
        )}
        animate={{
          width: animate ? (open ? "300px" : "60px") : "300px",
        }}
        {...props}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
};

export const MobileSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  const { open, setOpen } = useSidebar();
  return (
    <div
      className={cn(
        "h-10 px-4 py-4 flex flex-row md:hidden  items-center justify-between bg-neutral-100 dark:bg-neutral-800 w-full"
      )}
      {...props}
    >
      <div className="flex justify-end z-20 w-full">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label="Open sidebar"
          className="text-neutral-800 dark:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
        >
          <IconMenu2 />
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <LazyMotion features={domAnimation}>
            <m.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: "easeInOut",
              }}
              className={cn(
                "fixed h-full w-full inset-0 bg-white dark:bg-neutral-900 p-10 z-100 flex flex-col justify-between",
                className
              )}
            >
              <button
                type="button"
                aria-label="Close sidebar"
                className="absolute right-10 top-10 z-50 text-neutral-800 dark:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
                onClick={() => setOpen(!open)}
              >
                <IconX />
              </button>
              {children}
            </m.div>
          </LazyMotion>
        )}
      </AnimatePresence>
    </div>
  );
};

export const SidebarLink = ({
  link,
  className,
  ...props
}: {
  link: Links;
  className?: string;
} & React.ComponentProps<"a">) => {
  const { open, animate } = useSidebar();
  return (
    <a
      href={link.href}
      className={cn(
        "flex items-center gap-2 group/sidebar py-2 px-1 rounded-md transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700/50",
        !open && "justify-center",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-center w-6 h-6 shrink-0">
        {link.icon}
      </div>

      <LazyMotion features={domAnimation}>
        <m.span
          animate={{
            display: animate ? (open ? "inline-block" : "none") : "inline-block",
            opacity: animate ? (open ? 1 : 0) : 1,
            x: open ? 0 : -10,
          }}
          transition={{ duration: 0.2 }}
          className="text-neutral-700 dark:text-neutral-200 group-hover/sidebar:translate-x-1 transition-transform duration-150 whitespace-pre inline-block p-0! m-0! text-sm font-medium"
        >
          {link.label}
        </m.span>
      </LazyMotion>
    </a>
  );
};

export const SidebarTrigger = ({
  className,
  onClick,
  children,
  type,
  ...props
}: React.ComponentProps<"button">) => {
  const { open, setOpen } = useSidebar();
  return (
    <button
      type={type ?? "button"}
      className={cn("", className)}
      onClick={(e) => {
        onClick?.(e);
        setOpen(!open);
      }}
      {...props}
    >
      {children || (
        <IconMenu2 className="h-5 w-5 text-neutral-800 dark:text-neutral-200" />
      )}
      <span className="sr-only">Toggle Sidebar</span>
    </button>
  );
};
