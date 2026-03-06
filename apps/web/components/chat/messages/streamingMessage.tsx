"use client";

import { memo, useMemo } from "react";
import { m, AnimatePresence } from "motion/react";
import { ThinkingIndicator } from "./thinkingIndicator";
import { TypingIndicator } from "./typingIndicator";
import { SandboxIndicator } from "@/components/chat/sandbox/sandboxIndicator";
import { InstallBlock } from "@/components/chat/blocks/installBlock";
import { WebSearchBlock } from "@/components/chat/blocks/webSearchBlock";
import { UrlScrapeBlock } from "@/components/chat/blocks/urlScrapeBlock";
import { EdwardAvatar } from "./avatars";
import { Box, Search, Link2 } from "lucide-react";
import { MessageMetrics } from "./streamMetrics";
import { MarkdownRenderer } from "@/components/chat/messages/markdownRenderer";
import { ProjectButton } from "@/components/chat/sandbox/workspaceToggleButton";
import { MessageBlockType, parseMessageContent } from "@/lib/parsing/messageParser";
import { FileBlock } from "@/components/chat/blocks/fileBlock";
import { AssistantErrorCard } from "@/components/chat/blocks/assistantErrorCard";
import { mapStreamErrorToViewModel } from "@/lib/errors/assistantError";
import { useChatWorkspaceContext } from "@/components/chat/chatWorkspaceContext";
import { ChatRole } from "@edward/shared/chat/types";

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

function getStreamingBlockBaseKey(
  block: ReturnType<typeof parseMessageContent>[number],
): string {
  switch (block.type) {
    case MessageBlockType.TEXT:
      return "stream-text";
    case MessageBlockType.FILE:
      return `stream-file-${block.path}`;
    default:
      return `stream-${block.type}`;
  }
}

function buildSearchingLabel(query: string): string {
  const normalized = query.trim();
  if (!normalized) {
    return "Searching web...";
  }
  const maxLength = 96;
  const truncated =
    normalized.length > maxLength
      ? `${normalized.slice(0, maxLength - 1)}...`
      : normalized;
  return `Searching "${truncated}"...`;
}

interface OrderedStreamingSection {
  kind: "text" | "project" | "web_search" | "url_scrape" | "install";
  order: number;
  index?: number;
}

export const StreamingMessage = memo(function StreamingMessage() {
  const {
    messages,
    stream,
    onRetryStreamError,
    retryDisabled,
  } = useChatWorkspaceContext();

  const blocks = useMemo(() => {
    return parseMessageContent(stream.streamingText);
  }, [stream.streamingText]);

  const hasPersistedAssistantMessageForStream = useMemo(() => {
    const assistantMessageId = stream.meta?.assistantMessageId;
    if (!assistantMessageId) {
      return false;
    }
    return messages.some(
      (message) =>
        message.role === ChatRole.ASSISTANT && message.id === assistantMessageId,
    );
  }, [messages, stream.meta?.assistantMessageId]);
  const hasActiveRecoverableStreamError =
    stream.isStreaming && stream.error?.severity === "recoverable";
  const shouldSuppressStreamError =
    stream.error?.severity === "recoverable" &&
    (hasPersistedAssistantMessageForStream || hasActiveRecoverableStreamError);

  const hasAnyContent = useMemo(
    () =>
      stream.streamingText ||
      stream.thinkingText ||
      stream.activeFiles.length > 0 ||
      stream.completedFiles.length > 0 ||
      stream.isThinking ||
      stream.isSandboxing ||
      stream.command ||
      stream.webSearches.length > 0 ||
      stream.urlScrapes.length > 0 ||
      stream.installingDeps.length > 0 ||
      (stream.error && !shouldSuppressStreamError),
    [shouldSuppressStreamError, stream],
  );

  const allFiles = useMemo(() => {
    return [...stream.activeFiles, ...stream.completedFiles];
  }, [stream.activeFiles, stream.completedFiles]);
  const blockKeys = useMemo(
    () => buildStableKeys(blocks, getStreamingBlockBaseKey),
    [blocks],
  );
  const webSearchKeys = useMemo(
    () =>
      buildStableKeys(
        stream.webSearches,
        (webSearch) =>
          `stream-search-${webSearch.query}-${webSearch.maxResults ?? "default"}`,
      ),
    [stream.webSearches],
  );
  const urlScrapeKeys = useMemo(
    () =>
      buildStableKeys(
        stream.urlScrapes,
        (urlScrape) =>
          `stream-url-scrape-${urlScrape.results.map((result) => result.url).join("|")}`,
      ),
    [stream.urlScrapes],
  );

  const showProjectButton =
    allFiles.length > 0 ||
    stream.isSandboxing ||
    (stream.isStreaming && Boolean(stream.command));
  const orderedSections = useMemo(() => {
    const sections: OrderedStreamingSection[] = [];
    const FALLBACK_ORDER_BASE = 100_000;

    if (blocks.length > 0) {
      sections.push({
        kind: "text",
        order: stream.textOrder ?? FALLBACK_ORDER_BASE + 10,
      });
    }

    if (showProjectButton) {
      sections.push({
        kind: "project",
        order: stream.projectOrder ?? FALLBACK_ORDER_BASE + 20,
      });
    }

    for (let index = 0; index < stream.webSearches.length; index += 1) {
      const webSearch = stream.webSearches[index];
      sections.push({
        kind: "web_search",
        index,
        order: webSearch?.uiOrder ?? FALLBACK_ORDER_BASE + 30 + index,
      });
    }

    for (let index = 0; index < stream.urlScrapes.length; index += 1) {
      const urlScrape = stream.urlScrapes[index];
      sections.push({
        kind: "url_scrape",
        index,
        order: urlScrape?.uiOrder ?? FALLBACK_ORDER_BASE + 40 + index,
      });
    }

    if (stream.installingDeps.length > 0) {
      sections.push({
        kind: "install",
        order: stream.installOrder ?? FALLBACK_ORDER_BASE + 50,
      });
    }

    return sections
      .map((section, index) => ({ ...section, _stableIndex: index }))
      .sort((a, b) =>
        a.order === b.order ? a._stableIndex - b._stableIndex : a.order - b.order,
      );
  }, [
    blocks.length,
    showProjectButton,
    stream.installOrder,
    stream.installingDeps.length,
    stream.projectOrder,
    stream.textOrder,
    stream.urlScrapes,
    stream.webSearches,
  ]);
  const streamError = useMemo(
    () =>
      stream.error && !shouldSuppressStreamError
        ? mapStreamErrorToViewModel(stream.error)
        : null,
    [shouldSuppressStreamError, stream.error],
  );

  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="flex gap-2 sm:gap-4 items-start flex-row group w-full"
    >
      <EdwardAvatar isActive />

      <div className="flex flex-col items-start gap-3 sm:gap-4 min-w-0 flex-1 w-full">
        {!hasAnyContent ? (
          <TypingIndicator isCodeMode={stream.codeOnly} />
        ) : null}

        {stream.isThinking || stream.thinkingText ? (
          <m.div
            layout
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full"
          >
            <ThinkingIndicator
              text={stream.thinkingText}
              isActive={stream.isThinking}
              duration={stream.thinkingDuration}
              isCodeMode={stream.codeOnly}
            />
          </m.div>
        ) : null}

        <AnimatePresence>
          {stream.isSandboxing && allFiles.length === 0 ? (
            <m.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full"
            >
              <SandboxIndicator />
            </m.div>
          ) : null}
        </AnimatePresence>

        {orderedSections.map((section) => {
          if (section.kind === "text") {
            return (
              <div key="ordered-stream-text" className="flex flex-col gap-3 w-full">
                {blocks.map((block, i) => {
                  const blockKey = blockKeys[i] ?? `stream-block-${block.type}`;
                  switch (block.type) {
                    case MessageBlockType.TEXT:
                      return (
                        <div
                          key={blockKey}
                          className="text-[14px] sm:text-[15px] leading-[1.8] tracking-tight font-medium text-foreground w-full relative"
                        >
                          <MarkdownRenderer content={block.content} />
                          {i === blocks.length - 1 && stream.isStreaming && (
                            <m.span
                              className="inline-block w-[3px] h-4 bg-primary/60 ml-0.5 rounded-full align-text-bottom"
                              animate={{ opacity: [0, 1, 0] }}
                              transition={{ duration: 0.8, repeat: Infinity }}
                            />
                          )}
                        </div>
                      );
                    case MessageBlockType.FILE:
                      if (block.isInternal) return null;
                      return (
                        <FileBlock
                          key={blockKey}
                          file={{
                            path: block.path,
                            content: block.content,
                            isComplete: true,
                          }}
                          index={i}
                        />
                      );
                    default:
                      return null;
                  }
                })}
              </div>
            );
          }

          if (section.kind === "project") {
            return (
              <AnimatePresence key="ordered-stream-project">
                <ProjectButton
                  isStreaming={stream.isStreaming || stream.activeFiles.length > 0}
                  files={allFiles}
                  activeFilePath={stream.activeFiles[0]?.path || null}
                  command={stream.command}
                />
              </AnimatePresence>
            );
          }

          if (section.kind === "web_search" && typeof section.index === "number") {
            const webSearch = stream.webSearches[section.index];
            if (!webSearch) {
              return null;
            }
            return (
              <m.div
                key={webSearchKeys[section.index]}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                  <Search className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-sky-500/70" />
                  <span className="text-[10px] sm:text-[11px] text-muted-foreground/70 font-mono">
                    {buildSearchingLabel(webSearch.query)}
                  </span>
                </div>
                <WebSearchBlock search={webSearch} />
              </m.div>
            );
          }

          if (section.kind === "url_scrape" && typeof section.index === "number") {
            const urlScrape = stream.urlScrapes[section.index];
            if (!urlScrape) {
              return null;
            }
            return (
              <m.div
                key={urlScrapeKeys[section.index]}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                  <Link2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-emerald-500/70" />
                  <span className="text-[10px] sm:text-[11px] text-muted-foreground/70 font-mono">
                    Scraping URLs...
                  </span>
                </div>
                <UrlScrapeBlock scrape={urlScrape} />
              </m.div>
            );
          }

          if (section.kind === "install") {
            return (
              <m.div
                key="ordered-stream-install"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                  <Box className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-amber-400/60" />
                  <span className="text-[10px] sm:text-[11px] text-muted-foreground/70 font-mono">
                    Installing dependencies...
                  </span>
                </div>
                <InstallBlock dependencies={stream.installingDeps} isActive />
              </m.div>
            );
          }

          return null;
        })}

        {streamError ? (
          <m.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full"
          >
            <AssistantErrorCard
              error={streamError}
              onRetry={onRetryStreamError}
              isRetryDisabled={retryDisabled}
            />
          </m.div>
        ) : null}

        {stream.metrics ? (
          <div className="flex flex-wrap items-center gap-x-1.5 sm:gap-x-2 gap-y-1 px-1 mt-1.5 sm:mt-2">
            <span className="text-[9px] sm:text-[10px] font-bold text-foreground/40 uppercase tracking-widest select-none leading-none shrink-0">
              Edward
            </span>
            <span className="w-1 h-1 rounded-full bg-foreground/[0.05] shrink-0" />
            <MessageMetrics
              completionTime={stream.metrics.completionTime}
              inputTokens={stream.metrics.inputTokens}
              outputTokens={stream.metrics.outputTokens}
            />
          </div>
        ) : null}
      </div>
    </m.div>
  );
});
