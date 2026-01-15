"use client";

import {
  Navbar as ResizableNavbar,
  NavBody,
  NavbarButton,
} from "./ui/resizableNavbar";
import Link from "next/link";
import { LoaderIcon } from "lucide-react";
import { IconBrandGithubFilled } from "@tabler/icons-react";
import { signIn } from "@/lib/auth-client";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useSession } from "@/lib/auth-client";
import UserProfile from "./userProfile";
import { useState } from "react";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";

export default function Navbar() {
  const { data: session, isPending } = useSession();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn();
    } finally {
      setIsLoading(false);
    }
  };

  if (session?.user) {
    return <div className="w-full bg-sidebar p-4 flex justify-between">
      <SidebarTrigger />
      <UserProfile />
    </div>
  }

  return (
    <ResizableNavbar className="top-4">
      <NavBody className="mt-2">
        <Link
          href="/"
          className="relative z-20 mr-4 flex items-center space-x-2 px-2 py-1 text-sm font-normal text-black"
        >
          <span className="font-semibold text-black dark:text-white text-xl">
            Edward.
          </span>
        </Link>
        {isPending ? (
          <Skeleton className="h-8 w-8 rounded-full" />
        ) : (
          <NavbarButton
            variant="primary"
            onClick={handleSignIn}
            disabled={isLoading}
            className="flex justify-between"
          >
            {isLoading ? (
              <>
                <LoaderIcon className="mr-2 h-5 w-5 animate-spin text-gray-500" />
              </>
            ) : (
              <>
                <IconBrandGithubFilled className="mr-2 h-5 w-5 text-black" />
              </>
            )}
            Log in
          </NavbarButton>
        )}
      </NavBody>
    </ResizableNavbar>
  );
}
