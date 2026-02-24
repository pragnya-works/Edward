import type { NavbarButtonVariant } from "./resizableNavbarContext";

export const NAVBAR_GLASS_SHADOW =
  "0 0 24px rgba(34, 42, 53, 0.06), 0 1px 1px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(34, 42, 53, 0.04), 0 0 4px rgba(34, 42, 53, 0.08), 0 16px 68px rgba(47, 48, 55, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1) inset";

export const NAVBAR_BUTTON_BASE_STYLES =
  "px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold relative cursor-pointer hover:-translate-y-0.5 transition duration-200 inline-flex items-center justify-center text-center";

export const NAVBAR_BUTTON_VARIANT_STYLES: Record<NavbarButtonVariant, string> =
  {
    primary:
      "shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]",
    secondary: "bg-transparent shadow-none text-foreground",
    dark: "bg-foreground text-background shadow-lg",
    gradient:
      "bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-[0px_2px_0px_0px_rgba(255,255,255,0.3)_inset]",
  };

export function getDesktopBodyAnimation(visible: boolean) {
  return {
    backdropFilter: visible ? "blur(10px)" : "none",
    boxShadow: visible ? NAVBAR_GLASS_SHADOW : "none",
    width: visible ? "40%" : "100%",
    y: visible ? 20 : 0,
  };
}

export function getMobileBodyAnimation(visible: boolean) {
  return {
    backdropFilter: visible ? "blur(10px)" : "none",
    boxShadow: visible ? NAVBAR_GLASS_SHADOW : "none",
    width: visible ? "90%" : "100%",
    y: visible ? 20 : 0,
    borderRadius: visible ? "24px" : "0px",
  };
}
