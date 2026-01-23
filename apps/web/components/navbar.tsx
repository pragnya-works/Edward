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
} from "./ui/resizableNavbar";
import Link from "next/link";
import { LoaderIcon } from "lucide-react";
import { IconBrandGithubFilled } from "@tabler/icons-react";
import { signIn } from "@/lib/auth-client";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useSession } from "@/lib/auth-client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

export default function Navbar() {
  const { data: session, isPending } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn();
    } finally {
      setIsLoading(false);
    }
  };

  if (session?.user) {
    return null;
  }

  return (
    <ResizableNavbar className="top-0 md:top-4">
      <NavBody>
        {({ visible }) => (
          <>
            <NavbarLogo />

            <div className="flex items-center gap-2">
              <AnimatePresence>
                {visible && (
                  <motion.div
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
                  </motion.div>
                )}
              </AnimatePresence>
              {isPending ? (
                <Skeleton className="h-8 w-8 rounded-full" />
              ) : (
                <NavbarButton
                  variant="primary"
                  onClick={handleSignIn}
                  disabled={isLoading}
                  className="flex justify-between rounded-full"
                >
                  {isLoading ? (
                    <>
                      <LoaderIcon className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
                    </>
                  ) : (
                    <>
                      <IconBrandGithubFilled className="mr-2 h-5 w-5 text-primary-foreground" />
                    </>
                  )}
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
          <MobileNavToggle
            isOpen={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          />
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
              setIsMobileMenuOpen(false);
              handleSignIn();
            }}
            disabled={isLoading}
            className="w-full justify-center"
          >
            {isLoading ? (
              <LoaderIcon className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <IconBrandGithubFilled className="mr-2 h-5 w-5" />
            )}
            Log in
          </NavbarButton>
        </MobileNavMenu>
      </MobileNav>
    </ResizableNavbar>
  );
}