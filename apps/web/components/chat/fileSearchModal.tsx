"use client";

import { useCallback, useMemo } from "react";
import { Search } from "lucide-react";
import { useSandbox } from "@/contexts/sandboxContext";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@edward/ui/components/command";
import { cn } from "@edward/ui/lib/utils";
import { VscodeFileIcon } from "./vscodeFileIcon";

interface IndexedFile {
    path: string;
    name: string;
    directory: string;
    extension: string;
}

function getFileMeta(path: string): IndexedFile {
    const parts = path.split("/").filter(Boolean);
    const name = parts[parts.length - 1] ?? path;
    const directory = parts.length > 1 ? parts.slice(0, -1).join("/") : "root";
    const extension = name.includes(".") ? (name.split(".").pop() ?? "") : "";

    return {
        path,
        name,
        directory,
        extension,
    };
}

export function FileSearchModal() {
    const {
        isSearchOpen,
        closeSearch,
        files,
        activeFilePath,
        setActiveFile,
    } = useSandbox();

    const indexedFiles = useMemo(
        () => files.map((file) => getFileMeta(file.path)),
        [files],
    );
    const handleSelect = useCallback(
        (path: string) => {
            setActiveFile(path);
            closeSearch();
        },
        [closeSearch, setActiveFile],
    );

    return (
        <CommandDialog
            open={isSearchOpen}
            onOpenChange={(open) => {
                if (!open) {
                    closeSearch();
                }
            }}
            className={cn(
                "max-w-2xl gap-0 overflow-hidden border border-workspace-border/90 bg-workspace-bg/95 p-0 shadow-2xl backdrop-blur-xl",
                "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:rounded-md [&_[data-slot=dialog-close]]:p-1.5 [&_[data-slot=dialog-close]]:text-workspace-foreground/60 [&_[data-slot=dialog-close]]:opacity-100 [&_[data-slot=dialog-close]]:hover:bg-workspace-hover [&_[data-slot=dialog-close]]:hover:text-workspace-foreground",
            )}
        >
            <div className="border-b border-workspace-border/80 bg-workspace-sidebar/80">
                <CommandInput
                    placeholder="Search files by name..."
                    className="text-[15px] text-workspace-foreground placeholder:text-workspace-foreground/50"
                />
            </div>

            <CommandList className="max-h-[400px] bg-workspace-bg px-1 py-1.5">
                <CommandEmpty className="flex min-h-28 items-center justify-center gap-2 text-sm text-workspace-foreground/70">
                    <Search className="h-4 w-4 opacity-70" />
                    No files found.
                </CommandEmpty>

                <CommandGroup
                    heading={`Sandbox Files (${indexedFiles.length})`}
                    className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-workspace-foreground/60"
                >
                    {indexedFiles.map((file) => {
                        const isActive = file.path === activeFilePath;

                        return (
                            <CommandItem
                                key={file.path}
                                value={file.path}
                                keywords={[file.name, file.directory, file.extension]}
                                onSelect={(value) => {
                                    handleSelect(value);
                                }}
                                className={cn(
                                    "group relative flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2.5 text-workspace-foreground/85 transition-[background-color,color,box-shadow] duration-150",
                                    "after:pointer-events-none after:absolute after:inset-x-2.5 after:bottom-0 after:h-px after:bg-workspace-border/40 last:after:hidden",
                                    "hover:bg-workspace-hover/55 hover:text-workspace-foreground",
                                    "data-[selected=true]:bg-workspace-hover/70 data-[selected=true]:text-workspace-foreground data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-workspace-border",
                                    isActive &&
                                        "bg-workspace-accent/9 text-workspace-foreground before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-r before:bg-workspace-accent data-[selected=true]:bg-workspace-accent/14 data-[selected=true]:ring-workspace-accent/40",
                                )}
                            >
                                <VscodeFileIcon
                                    path={file.path}
                                    className="h-[17px] w-[17px] text-workspace-foreground/80"
                                />

                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] font-medium leading-tight">
                                        {file.name}
                                    </p>
                                    <p className="truncate text-[11px] text-workspace-foreground/55">
                                        {file.directory}
                                    </p>
                                </div>

                                {file.extension ? (
                                    <span className="rounded border border-workspace-border bg-workspace-sidebar px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-workspace-foreground/60">
                                        {file.extension}
                                    </span>
                                ) : null}

                                {isActive ? (
                                    <span
                                        className="h-1.5 w-1.5 rounded-full bg-workspace-accent"
                                        aria-hidden="true"
                                    />
                                ) : null}
                            </CommandItem>
                        );
                    })}
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
}
