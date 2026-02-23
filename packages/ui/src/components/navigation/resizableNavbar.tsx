"use client";

import Link from "next/link";
import {
  AnimatePresence,
  m,
  useMotionValueEvent,
  useScroll,
} from "motion/react";
import { Menu, X } from "lucide-react";
import React, { useRef, useState } from "react";
import { cn } from "@edward/ui/lib/utils";
import { EdwardLogo } from "@edward/ui/components/brand/edwardLogo";
import {
  isNavBodyRenderProp,
  NavbarContextProvider,
  useNavbarContext,
  type MobileNavHeaderProps,
  type MobileNavMenuProps,
  type MobileNavProps,
  type MobileNavToggleProps,
  type NavBodyProps,
  type NavbarButtonComponentProps,
  type NavbarLogoProps,
  type NavbarProps,
} from "./resizableNavbarContext";
import {
  getDesktopBodyAnimation,
  getMobileBodyAnimation,
  NAVBAR_BUTTON_BASE_STYLES,
  NAVBAR_BUTTON_VARIANT_STYLES,
} from "./resizableNavbarStyles";

const BUTTON_ELEMENT = "button";

export const Navbar = ({ children, className }: NavbarProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const [visible, setVisible] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setVisible(latest > 100);
  });

  return (
    <NavbarContextProvider visible={visible}>
      <m.div
        ref={ref}
        className={cn("sticky inset-x-0 top-20 z-40 w-full", className)}
      >
        {children}
      </m.div>
    </NavbarContextProvider>
  );
};

export const NavBody = ({ children, className }: NavBodyProps) => {
  const { visible } = useNavbarContext();

  return (
    <m.div
      animate={getDesktopBodyAnimation(visible)}
      transition={{ type: "spring", stiffness: 200, damping: 50 }}
      className={cn(
        "relative z-50 mx-auto hidden w-full max-w-7xl flex-row items-center justify-between self-start rounded-full bg-transparent px-4 py-2 md:flex dark:bg-transparent",
        visible && "bg-background/80",
        className,
      )}
    >
      {isNavBodyRenderProp(children) ? children({ visible }) : children}
    </m.div>
  );
};

export const MobileNav = ({
  children,
  className,
  isOpen,
  onClose,
}: MobileNavProps) => {
  const { visible } = useNavbarContext();

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <m.button
            type="button"
            aria-label="Close mobile menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>
      <m.div
        animate={getMobileBodyAnimation(visible)}
        transition={{ type: "spring", stiffness: 200, damping: 50 }}
        className={cn(
          "absolute inset-x-0 z-50 mx-auto flex w-full flex-col self-start bg-transparent px-4 py-2 md:hidden",
          visible && "bg-background/80",
          className,
        )}
      >
        {children}
      </m.div>
    </>
  );
};

export const MobileNavHeader = ({
  children,
  className,
}: MobileNavHeaderProps) => {
  return (
    <div className={cn("flex w-full items-center justify-between", className)}>
      {children}
    </div>
  );
};

export const MobileNavToggle = ({
  isOpen,
  onClick,
  className,
}: MobileNavToggleProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isOpen ? "Close menu" : "Open menu"}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
}: MobileNavMenuProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={cn("flex flex-col gap-4 overflow-hidden pb-4 pt-4", className)}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
};

export const NavbarLogo = ({ className, children }: NavbarLogoProps) => {
  return (
    <Link
      href="/"
      className={cn(
        "relative z-20 flex items-center space-x-2 text-sm font-normal text-foreground",
        className,
      )}
    >
      {children || (
        <>
          <EdwardLogo
            size={22}
            priority
            quality={78}
            sizes="22px"
            className="rounded-md"
          />
          <span className="text-xl font-semibold text-foreground">Edward.</span>
        </>
      )}
    </Link>
  );
};

export const NavbarButton = ({
  href,
  as: Tag,
  children,
  className,
  variant = "primary",
  ...props
}: NavbarButtonComponentProps) => {
  const Component = Tag || (href ? Link : BUTTON_ELEMENT);
  const buttonType =
    Component === BUTTON_ELEMENT
      ? (props as React.ComponentPropsWithoutRef<"button">).type ?? BUTTON_ELEMENT
      : undefined;

  return (
    <Component
      href={href || undefined}
      type={buttonType}
      className={cn(
        NAVBAR_BUTTON_BASE_STYLES,
        NAVBAR_BUTTON_VARIANT_STYLES[variant],
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
};
