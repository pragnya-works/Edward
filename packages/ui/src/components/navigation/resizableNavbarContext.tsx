import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import Link from "next/link";

interface NavbarVisibilityProps {
  visible: boolean;
}

export interface NavbarProps {
  children: ReactNode;
  className?: string;
}

export interface NavBodyProps {
  children: ReactNode | ((props: NavbarVisibilityProps) => ReactNode);
  className?: string;
}

export interface MobileNavProps {
  children: ReactNode;
  className?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export interface MobileNavHeaderProps {
  children: ReactNode;
  className?: string;
}

export interface MobileNavToggleProps {
  isOpen: boolean;
  onClick: () => void;
  className?: string;
}

export interface MobileNavMenuProps {
  isOpen: boolean;
  children: ReactNode;
  className?: string;
}

export interface NavbarLogoProps {
  className?: string;
  children?: ReactNode;
}

export type NavbarButtonVariant = "primary" | "secondary" | "dark" | "gradient";

export interface NavbarButtonProps {
  href?: string;
  as?: React.ElementType;
  children: ReactNode;
  className?: string;
  variant?: NavbarButtonVariant;
}

export type NavbarButtonComponentProps = NavbarButtonProps &
  (
    | React.ComponentPropsWithoutRef<typeof Link>
    | React.ComponentPropsWithoutRef<"button">
  );

const NavbarContext = createContext<NavbarVisibilityProps | undefined>(undefined);

export function NavbarContextProvider({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactNode;
}) {
  return (
    <NavbarContext.Provider value={{ visible }}>{children}</NavbarContext.Provider>
  );
}

export function useNavbarContext() {
  const context = useContext(NavbarContext);
  if (!context) {
    throw new Error("useNavbarContext must be used within a Navbar");
  }
  return context;
}

export function isNavBodyRenderProp(
  children: NavBodyProps["children"],
): children is (props: NavbarVisibilityProps) => ReactNode {
  return typeof children === "function";
}
