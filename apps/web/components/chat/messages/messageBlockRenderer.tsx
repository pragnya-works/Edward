"use client";

import { useCallback, useMemo } from "react";
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
import { useSandbox } from "@/stores/sandbox/hooks";

interface MessageBlockRendererProps {
  blocks: MessageBlock[];
  fileBlocks: Extract<MessageBlock, { type: MessageBlockType.FILE }>[];
  showFooterButton: boolean;
}

function buildStableKeys<T>(
  items: T[],
  getBaseKey: (item: T) => string,
): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = getBaseKey(item);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return occurrence === 0 ? base : `${base}::${occurrence}`;
  });
}

function getMessageBlockBaseKey(block: MessageBlock): string {
  switch (block.type) {
    case MessageBlockType.THINKING:
      return "thinking";
    case MessageBlockType.FILE:
      return `file-${block.path}`;
    case MessageBlockType.COMMAND:
      return `command-${block.command}-${block.args.join(" ")}`;
    case MessageBlockType.WEB_SEARCH:
      return `web-search-${block.query}-${block.maxResults ?? "default"}`;
    case MessageBlockType.URL_SCRAPE:
      return `url-scrape-${block.url}-${block.status}`;
    case MessageBlockType.INSTALL:
      return `install-${block.dependencies.join("|")}`;
    case MessageBlockType.SANDBOX:
      return `sandbox-${block.project ?? "project"}-${block.base ?? "base"}`;
    case MessageBlockType.DONE:
      return "done";
    case MessageBlockType.TEXT:
      return "text";
  }
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
  const blockKeys = useMemo(
    () => buildStableKeys(blocks, getMessageBlockBaseKey),
    [blocks],
  );
  let sandboxBlockRendered = false;

  return (
    <div className="flex flex-col gap-2 sm:gap-3 w-full">
      {blocks.map((block, index) => {
        const blockKey = blockKeys[index] ?? `block-${block.type}`;
        switch (block.type) {
          case MessageBlockType.THINKING:
            return (
              <ThinkingIndicator
                key={blockKey}
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
                key={blockKey}
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
                key={blockKey}
                command={{
                  type: ParserEventType.COMMAND,
                  version: STREAM_EVENT_VERSION,
                  command: block.command,
                  args: block.args,
                  exitCode: block.exitCode,
                  stdout: block.stdout,
                  stderr: block.stderr,
                }}
              />
            );
          case MessageBlockType.WEB_SEARCH:
            return (
              <WebSearchBlock
                key={blockKey}
                search={{
                  type: ParserEventType.WEB_SEARCH,
                  version: STREAM_EVENT_VERSION,
                  query: block.query,
                  maxResults: block.maxResults,
                  answer: block.answer,
                  error: block.error,
                  results: block.results,
                }}
              />
            );
          case MessageBlockType.URL_SCRAPE:
            return (
              <UrlScrapeBlock
                key={blockKey}
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
                key={blockKey}
                dependencies={block.dependencies}
                isActive={false}
              />
            );
          case MessageBlockType.SANDBOX:
            if (sandboxBlockRendered) {
              return null;
            }
            sandboxBlockRendered = true;
            return (
              <m.div
                key={blockKey}
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
                key={blockKey}
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
            className="w-full"
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
