"use client";
import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import {
  motion,
  useScroll,
  useMotionValueEvent,
  AnimatePresence,
} from "motion/react";
import { Menu, X } from "lucide-react";
import React, { createContext, useContext, useRef, useState } from "react";

interface NavbarProps {
  children: React.ReactNode;
  className?: string;
}

interface NavBodyProps {
  children:
  | React.ReactNode
  | ((props: { visible: boolean }) => React.ReactNode);
  className?: string;
}

interface NavbarContextType {
  visible: boolean;
}

const NavbarContext = createContext<NavbarContextType | undefined>(undefined);

const useNavbarContext = () => {
  const context = useContext(NavbarContext);
  if (!context) {
    throw new Error("useNavbarContext must be used within a Navbar");
  }
  return context;
};

export const Navbar = ({ children, className }: NavbarProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const [visible, setVisible] = useState<boolean>(false);

  useMotionValueEvent(scrollY, "change", (latest: number) => {
    if (latest > 100) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  });

  return (
    <NavbarContext.Provider value={{ visible }}>
      <motion.div
        ref={ref}
        className={cn("sticky inset-x-0 top-20 z-40 w-full", className)}
      >
        {children}
      </motion.div>
    </NavbarContext.Provider>
  );
};

export const NavBody = ({ children, className }: NavBodyProps) => {
  const { visible } = useNavbarContext();

  return (
    <motion.div
      animate={{
        backdropFilter: visible ? "blur(10px)" : "none",
        boxShadow: visible
          ? "0 0 24px rgba(34, 42, 53, 0.06), 0 1px 1px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(34, 42, 53, 0.04), 0 0 4px rgba(34, 42, 53, 0.08), 0 16px 68px rgba(47, 48, 55, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1) inset"
          : "none",
        width: visible ? "40%" : "100%",
        y: visible ? 20 : 0,
      }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 50,
      }}
      className={cn(
        "relative z-[60] mx-auto hidden md:flex w-full max-w-7xl flex-row items-center justify-between self-start rounded-full bg-transparent px-4 py-2 dark:bg-transparent",
        visible && "bg-background/80",
        className,
      )}
    >
      {typeof children === "function" ? children({ visible }) : children}
    </motion.div>
  );
};

export const MobileNav = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const { visible } = useNavbarContext();

  return (
    <motion.div
      animate={{
        backdropFilter: visible ? "blur(10px)" : "none",
        boxShadow: visible
          ? "0 0 24px rgba(34, 42, 53, 0.06), 0 1px 1px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(34, 42, 53, 0.04), 0 0 4px rgba(34, 42, 53, 0.08), 0 16px 68px rgba(47, 48, 55, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1) inset"
          : "none",
        width: visible ? "90%" : "100%",
        y: visible ? 20 : 0,
        borderRadius: visible ? "24px" : "0px",
      }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 50,
      }}
      className={cn(
        "relative z-[60] mx-auto flex w-full md:hidden flex-col self-start bg-transparent px-4 py-2 dark:bg-transparent",
        visible && "bg-background/80",
        className,
      )}
    >
      {children}
    </motion.div>
  );
};

export const MobileNavHeader = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn("flex items-center justify-between w-full", className)}>
      {children}
    </div>
  );
};

export const MobileNavToggle = ({
  isOpen,
  onClick,
  className,
}: {
  isOpen: boolean;
  onClick: () => void;
  className?: string;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-accent focus:outline-none",
        className,
      )}
    >
      {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
    </button>
  );
};

export const MobileNavMenu = ({
  isOpen,
  children,
  className,
}: {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={cn(
            "overflow-hidden pt-4 pb-4 flex flex-col gap-4",
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const NavbarLogo = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <Link
      href="/"
      className={cn(
        "relative z-20 flex items-center space-x-2 text-sm font-normal text-foreground",
        className,
      )}
    >
      {children || (
        <span className="font-semibold text-foreground text-xl">
          Edward.
        </span>
      )}
    </Link>
  );
};

export const NavItems = ({
  items,
  className,
}: {
  items: { name: string; link: string }[];
  className?: string;
}) => {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      {items.map((item, idx) => (
        <Link
          key={idx}
          href={item.link}
          className="relative text-muted-foreground hover:text-foreground transition-colors"
        >
          {item.name}
        </Link>
      ))}
    </div>
  );
};

type NavbarButtonVariant = "primary" | "secondary" | "dark" | "gradient";

interface NavbarButtonProps {
  href?: string;
  as?: React.ElementType;
  children: React.ReactNode;
  className?: string;
  variant?: NavbarButtonVariant;
}

export const NavbarButton = ({
  href,
  as: Tag,
  children,
  className,
  variant = "primary",
  ...props
}: NavbarButtonProps & (
  | React.ComponentPropsWithoutRef<typeof Link>
  | React.ComponentPropsWithoutRef<"button">
)) => {
  const baseStyles =
    "px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold relative cursor-pointer hover:-translate-y-0.5 transition duration-200 inline-flex items-center justify-center text-center";

  const variantStyles: Record<NavbarButtonVariant, string> = {
    primary:
      "shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]",
    secondary: "bg-transparent shadow-none text-foreground",
    dark: "bg-foreground text-background shadow-lg",
    gradient:
      "bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-[0px_2px_0px_0px_rgba(255,255,255,0.3)_inset]",
  };

  const Component = Tag || (href ? Link : "button");

  return (
    <Component
      href={href || undefined}
      className={cn(baseStyles, variantStyles[variant], className)}
      {...props}
    >
      {children}
    </Component>
  );
};