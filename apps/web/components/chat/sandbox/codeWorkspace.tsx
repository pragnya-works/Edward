import type { Dispatch, ReactNode, SetStateAction } from "react";
import { PanelLeftOpen, Search } from "lucide-react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Button } from "@edward/ui/components/button";
import { Sheet, SheetContent } from "@edward/ui/components/sheet";
import { SandboxActivityBar } from "@/components/chat/sandbox/sandboxActivityBar";
import { SandboxFileSidebar } from "@/components/chat/sandbox/sandboxFileSidebar";

interface CodeWorkspaceProps {
  isMobile: boolean;
  isMobileExplorerOpen: boolean;
  setIsMobileExplorerOpen: Dispatch<SetStateAction<boolean>>;
  openSearch: () => void;
  activeFilePath: string | null;
  editorSurface: ReactNode;
}

export function CodeWorkspace({
  isMobile,
  isMobileExplorerOpen,
  setIsMobileExplorerOpen,
  openSearch,
  activeFilePath,
  editorSurface,
}: CodeWorkspaceProps) {
  return (
    <div className="flex h-full w-full bg-workspace-bg">
      {isMobile ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-2 justify-between border-b border-workspace-border bg-workspace-sidebar px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 border-workspace-border bg-workspace-bg text-workspace-foreground hover:bg-workspace-hover"
                onClick={() => setIsMobileExplorerOpen(true)}
              >
                <PanelLeftOpen className="h-3.5 w-3.5" />
                Explorer
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 border-workspace-border bg-workspace-bg text-workspace-foreground hover:bg-workspace-hover"
                onClick={openSearch}
              >
                <Search className="h-3.5 w-3.5" />
                Search
              </Button>
            </div>

            {activeFilePath && (
              <span className="text-[11px] font-mono text-workspace-foreground/80 truncate max-w-[42vw]">
                {activeFilePath}
              </span>
            )}
          </div>

          <Sheet
            open={isMobileExplorerOpen}
            onOpenChange={setIsMobileExplorerOpen}
          >
            <SheetContent
              side="left"
              className="w-[82vw] max-w-sm p-0 gap-0 bg-workspace-sidebar border-workspace-border"
            >
              <SandboxFileSidebar />
            </SheetContent>
          </Sheet>

          <div className="flex-1 min-h-0 flex flex-col bg-workspace-bg">
            {editorSurface}
          </div>
        </div>
      ) : (
        <>
          <SandboxActivityBar />

          <PanelGroup orientation="horizontal" className="flex-1 min-h-0 bg-workspace-bg select-none">
            <Panel
              minSize={100}
              maxSize={200}
              className="bg-workspace-sidebar"
            >
              <SandboxFileSidebar />
            </Panel>

            <PanelResizeHandle className="w-1 bg-workspace-border hover:bg-workspace-accent/60 transition-colors cursor-col-resize z-10 select-none hover:shadow-[inset_0_0_8px_rgba(79,193,255,0.15)]" />

            <Panel className="flex flex-col bg-workspace-bg relative min-w-0">
              {editorSurface}
            </Panel>
          </PanelGroup>
        </>
      )}
    </div>
  );
}
