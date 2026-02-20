"use client";

import { cn } from "@edward/ui/lib/utils";
import { Files, Search } from "lucide-react";
import { Button } from "@edward/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipPositioner,
  TooltipTrigger,
} from "@edward/ui/components/tooltip";
import { Separator } from "@edward/ui/components/separator";
import { useSandbox } from "@/contexts/sandboxContext";

export function SandboxActivityBar() {
  const { isSearchOpen, closeSearch, toggleSearch } = useSandbox();

  return (
    <div className="w-12 shrink-0 h-full bg-workspace-sidebar border-r border-workspace-border flex flex-col items-center py-2 z-20">
      <div className="flex-1 flex flex-col items-center gap-2 w-full">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "relative h-10 w-10 rounded-md text-workspace-foreground",
                  !isSearchOpen
                    ? "bg-workspace-active"
                    : "hover:bg-workspace-hover text-workspace-foreground/70 hover:text-workspace-foreground",
                )}
                onClick={closeSearch}
                aria-label="Open explorer"
              >
                {!isSearchOpen && (
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-sm bg-workspace-accent" />
                )}
                <Files className="h-5 w-5" />
              </Button>
            }
          />
          <TooltipPositioner side="right">
            <TooltipContent>Explorer</TooltipContent>
          </TooltipPositioner>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "relative h-10 w-10 rounded-md text-workspace-foreground",
                  isSearchOpen
                    ? "bg-workspace-active"
                    : "hover:bg-workspace-hover text-workspace-foreground/70 hover:text-workspace-foreground",
                )}
                onClick={toggleSearch}
                aria-label="Open file search"
              >
                {isSearchOpen && (
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-sm bg-workspace-accent" />
                )}
                <Search className="h-5 w-5" />
              </Button>
            }
          />
          <TooltipPositioner side="right">
            <TooltipContent>Search (Cmd+P)</TooltipContent>
          </TooltipPositioner>
        </Tooltip>
      </div>
      <Separator className="w-7 bg-workspace-border" />
    </div>
  );
}
