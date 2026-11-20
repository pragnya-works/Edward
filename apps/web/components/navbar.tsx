"use client";

import {
  Navbar as ResizableNavbar,
  NavBody,
  NavbarButton,
  MobileNav,
  MobileNavHeader,
  MobileNavToggle,
  MobileNavMenu,
  NavbarLogo,
} from "@edward/ui/components/navigation/resizableNavbar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { Skeleton } from "@edward/ui/components/skeleton";
import { LoginModal } from "@edward/ui/components/ui/loginModal";
import { useSession } from "@/lib/auth-client";
import { useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { GitHub } from "@edward/ui/components/icons/github";

export default function Navbar() {
  const { data: session, isPending } = useSession();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const mobileToggleRef = useRef<HTMLSpanElement>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const isChangelogPage = pathname === "/changelog";
  const isChatConversationRoute = pathname.startsWith("/chat/");

  if (session?.user) {
    return null;
  }

  if (isPending && isChatConversationRoute) {
    return null;
  }

  return (
    <>
      <ResizableNavbar className="top-0 md:top-4">
        <NavBody>
          {({ visible }) => (
            <>
              <NavbarLogo />

              <div className="flex items-center gap-2">
                <AnimatePresence>
                  {visible && !isChangelogPage && (
                    <m.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Link
                        href="/changelog"
                        className="relative z-20 mr-4 flex items-center space-x-2 px-2 py-1 text-sm font-normal text-foreground"
                      >
                        <span className="text-foreground hover:text-muted-foreground transition-colors">
                          Changelog
                        </span>
                      </Link>
                    </m.div>
                  )}
                </AnimatePresence>
                {isPending ? (
                  <Skeleton className="h-8 w-8 rounded-full" />
                ) : (
                  <NavbarButton
                    variant="primary"
                    onClick={() => setShowLoginModal(true)}
                    className="flex justify-between rounded-full"
                  >
                    <GitHub className="size-5 mr-3" />
                    Log in
                  </NavbarButton>
                )}
              </div>
            </>
          )}
        </NavBody>

        <MobileNav
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
          className={
            isMobileMenuOpen
              ? "bg-background/80 backdrop-blur-md rounded-2xl"
              : ""
          }
        >
          <MobileNavHeader>
            <NavbarLogo />
            <span ref={mobileToggleRef}>
              <MobileNavToggle
                isOpen={isMobileMenuOpen}
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              />
            </span>
          </MobileNavHeader>

          <MobileNavMenu
            isOpen={isMobileMenuOpen}
            className="flex flex-col gap-4"
          >
            <Link
              href="/changelog"
              className="text-lg font-medium hover:text-primary transition-colors px-2"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Changelog
            </Link>
            <NavbarButton
              variant="primary"
              onClick={() => {
                mobileToggleRef.current?.querySelector("button")?.focus();
                setIsMobileMenuOpen(false);
                setShowLoginModal(true);
              }}
              className="w-full justify-center"
            >
              <GitHub className="size-5 mr-3" />
              Log in
            </NavbarButton>
          </MobileNavMenu>
        </MobileNav>
      </ResizableNavbar>
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSignIn={signIn}
      />
    </>
  );
}
