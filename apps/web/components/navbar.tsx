"use client";

import {
  Navbar as ResizableNavbar,
  NavBody,
  NavbarButton,
} from "./ui/resizableNavbar";
import Link from "next/link";
import { IconBrandGithubFilled } from "@tabler/icons-react";
import { signIn } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar"
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useSession } from "@/lib/auth-client";

export default function Navbar() {
  const { data: session, isPending } = useSession();

  return (
    <ResizableNavbar className="top-4">
      <NavBody className="mt-2">
        <Link
          href="/"
          className="relative z-20 mr-4 flex items-center space-x-2 px-2 py-1 text-sm font-normal text-black"
        >
          <span className="font-semibold text-black dark:text-white text-xl">Edward.</span>
        </Link>
        {isPending ? (
          <Skeleton className="h-8 w-8 rounded-full" />
        ) : session?.user ? (
          <Avatar>
            <AvatarImage src={session.user.image || ""} />
            <AvatarFallback></AvatarFallback>
          </Avatar>
        ) : (
          <NavbarButton variant="primary" onClick={signIn} className="flex justify-between">
            <IconBrandGithubFilled className="mr-2 h-5 w-5 text-black" />
            Login
          </NavbarButton>
        )}
      </NavBody>
    </ResizableNavbar>
  );
}
