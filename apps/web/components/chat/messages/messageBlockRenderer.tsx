"use client";

import { useCallback } from "react";
import { AnimatePresence, m } from "motion/react";
import { ParserEventType, STREAM_EVENT_VERSION } from "@edward/shared/streamEvents";
import { CommandBlock } from "@/components/chat/blocks/commandBlock";
import { FileBlock } from "@/components/chat/blocks/fileBlock";
import { InstallBlock } from "@/components/chat/blocks/installBlock";
import { UrlScrapeBlock } from "@/components/chat/blocks/urlScrapeBlock";
import { WebSearchBlock } from "@/components/chat/blocks/webSearchBlock";
import { ProjectButton } from "@/components/chat/sandbox/workspaceToggleButton";
import { MessageBlockType, type MessageBlock } from "@/lib/parsing/messageParser";
import { MarkdownRenderer } from "@/components/chat/messages/markdownRenderer";
import { ThinkingIndicator } from "@/components/chat/messages/thinkingIndicator";
import { useSandbox } from "@/contexts/sandboxContext";

interface MessageBlockRendererProps {
  blocks: MessageBlock[];
  fileBlocks: Extract<MessageBlock, { type: MessageBlockType.FILE }>[];
  showFooterButton: boolean;
}

function mapFilesForWorkspace(
  fileBlocks: Extract<MessageBlock, { type: MessageBlockType.FILE }>[],
) {
  return fileBlocks.map((file) => ({
    path: file.path,
    content: file.content,
    isComplete: true,
  }));
}

export function MessageBlockRenderer({
  blocks,
  fileBlocks,
  showFooterButton,
}: MessageBlockRendererProps) {
  const { files: globalFiles, setFiles } = useSandbox();
  const workspaceFiles = mapFilesForWorkspace(fileBlocks);
  const handleBeforeToggleWorkspace = useCallback(() => {
    if (globalFiles.length === 0 && workspaceFiles.length > 0) {
      setFiles(workspaceFiles);
    }
  }, [globalFiles.length, setFiles, workspaceFiles]);

  return (
    <div className="flex flex-col gap-3 sm:gap-4 w-full">
      {blocks.map((block, index) => {
        switch (block.type) {
          case MessageBlockType.THINKING:
            return (
              <ThinkingIndicator
                key={`thinking-${block.content}`}
                text={block.content}
                isActive={false}
                isCodeMode={false}
              />
            );
          case MessageBlockType.FILE:
            if (block.isInternal) {
              return null;
            }
            return (
              <FileBlock
                key={`file-${block.path}`}
                file={{
                  path: block.path,
                  content: block.content,
                  isComplete: true,
                }}
                index={index}
              />
            );
          case MessageBlockType.COMMAND:
            return (
              <CommandBlock
                key={`command-${block.command}-${block.args.join(" ")}`}
                command={{
                  type: ParserEventType.COMMAND,
                  version: STREAM_EVENT_VERSION,
                  command: block.command,
                  args: block.args,
                }}
              />
            );
          case MessageBlockType.WEB_SEARCH:
            return (
              <WebSearchBlock
                key={`web-search-${block.query}-${block.maxResults ?? "default"}`}
                search={{
                  type: ParserEventType.WEB_SEARCH,
                  version: STREAM_EVENT_VERSION,
                  query: block.query,
                  maxResults: block.maxResults,
                }}
              />
            );
          case MessageBlockType.URL_SCRAPE:
            return (
              <UrlScrapeBlock
                key={`url-scrape-${block.url}-${block.status}`}
                scrape={{
                  type: ParserEventType.URL_SCRAPE,
                  version: STREAM_EVENT_VERSION,
                  results: [
                    block.status === "success"
                      ? {
                          status: "success",
                          url: block.url,
                          finalUrl: block.url,
                          title: block.title || block.url,
                          snippet: "",
                        }
                      : {
                          status: "error",
                          url: block.url,
                          error: block.error || "Failed to scrape URL",
                        },
                  ],
                }}
              />
            );
          case MessageBlockType.INSTALL:
            return (
              <InstallBlock
                key={`install-${block.dependencies.join("|")}`}
                dependencies={block.dependencies}
                isActive={false}
              />
            );
          case MessageBlockType.SANDBOX:
            return (
              <m.div
                key={`sandbox-${block.project ?? "project"}-${block.base ?? "base"}`}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full"
              >
                <ProjectButton
                  isStreaming={false}
                  files={workspaceFiles}
                  activeFilePath={null}
                  projectName={block.project}
                  onBeforeToggle={handleBeforeToggleWorkspace}
                />
              </m.div>
            );
          case MessageBlockType.DONE:
            return null;
          case MessageBlockType.TEXT:
            return (
              <div
                key={`text-${block.content}`}
                className="text-[14px] sm:text-[15px] leading-[1.7] sm:leading-[1.8] tracking-tight font-medium"
              >
                <MarkdownRenderer content={block.content} />
              </div>
            );
        }
      })}

      <AnimatePresence>
        {showFooterButton ? (
          <m.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-2"
          >
            <ProjectButton
              isStreaming={false}
              files={workspaceFiles}
              activeFilePath={null}
              projectName={undefined}
              onBeforeToggle={handleBeforeToggleWorkspace}
            />
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
