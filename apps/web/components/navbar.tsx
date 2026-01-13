"use client";

import {
  Navbar as ResizableNavbar,
  NavBody,
  NavbarButton,
} from "./ui/resizable-navbar";
import Link from "next/link";

export default function Navbar() {
  return (
    <ResizableNavbar className="top-4">
      <NavBody className="mt-2">
        <Link
          href="/"
          className="relative z-20 mr-4 flex items-center space-x-2 px-2 py-1 text-sm font-normal text-black"
        >
          <span className="font-semibold text-black dark:text-white text-xl">Edward.</span>
        </Link>
        <NavbarButton variant="primary">
          Login
        </NavbarButton>
      </NavBody>
    </ResizableNavbar>
  );
}
