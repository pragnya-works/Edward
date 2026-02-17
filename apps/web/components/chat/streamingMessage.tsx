"use client";

import { memo, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ThinkingIndicator } from "./thinkingIndicator";
import { TypingIndicator } from "./typingIndicator";
import { CommandBlock } from "./commandBlock";
import { SandboxIndicator } from "./sandboxIndicator";
import { InstallBlock } from "./installBlock";
import { WebSearchBlock } from "./webSearchBlock";
import { EdwardAvatar } from "./avatars";
import type { StreamState } from "@/lib/chatTypes";
import { Terminal, Box, Search } from "lucide-react";
import { MessageMetrics } from "./messageMetrics";
import { MarkdownRenderer } from "./markdownRenderer";
import { useSandbox } from "@/contexts/sandboxContext";
import { ProjectButton } from "./projectButton";
import { MessageBlockType, parseMessageContent } from "@/lib/messageParser";
import { FileBlock } from "./fileBlock";

interface StreamingMessageProps {
  stream: StreamState;
}

export const StreamingMessage = memo(function StreamingMessage({
  stream,
}: StreamingMessageProps) {
  const { isOpen: sandboxOpen } = useSandbox();

  const blocks = useMemo(() => {
    return parseMessageContent(stream.streamingText);
  }, [stream.streamingText]);

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
      stream.installingDeps.length > 0,
    [stream],
  );

  const allFiles = useMemo(() => {
    return [...stream.activeFiles, ...stream.completedFiles];
  }, [stream.activeFiles, stream.completedFiles]);

  const showProjectButton = allFiles.length > 0 || stream.isSandboxing;

  return (
    <motion.div
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
          <motion.div
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
          </motion.div>
        ) : null}

        <div className="flex flex-col gap-3 w-full">
          {blocks.map((block, i) => {
            switch (block.type) {
              case MessageBlockType.TEXT:
                return (
                  <div
                    key={i}
                    className="text-[14px] sm:text-[15px] leading-[1.8] tracking-tight font-medium text-foreground w-full relative"
                  >
                    <MarkdownRenderer content={block.content} />
                    {i === blocks.length - 1 && stream.isStreaming && (
                      <motion.span
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
                    key={i}
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

        <AnimatePresence>
          {stream.isSandboxing && allFiles.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full"
            >
              <SandboxIndicator />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {showProjectButton && (
            <ProjectButton
              isStreaming={stream.isStreaming || stream.activeFiles.length > 0}
              files={allFiles}
              activeFilePath={stream.activeFiles[0]?.path || null}
            />
          )}
        </AnimatePresence>

        {stream.command && !sandboxOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full"
          >
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <Terminal className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-emerald-400/60" />
              <span className="text-[10px] sm:text-[11px] text-muted-foreground/70 font-mono">
                Executing command...
              </span>
            </div>
            <CommandBlock command={stream.command} />
          </motion.div>
        )}

        {!sandboxOpen &&
          stream.webSearches.map((webSearch, idx) => (
            <motion.div
              key={`${webSearch.query}-${idx}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full"
            >
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                <Search className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-sky-500/70" />
                <span className="text-[10px] sm:text-[11px] text-muted-foreground/70 font-mono">
                  Searching web...
                </span>
              </div>
              <WebSearchBlock search={webSearch} />
            </motion.div>
          ))}

        {stream.installingDeps.length > 0 && !sandboxOpen && (
          <motion.div
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
            <InstallBlock dependencies={stream.installingDeps} />
          </motion.div>
        )}

        {stream.error ? (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full rounded-lg sm:rounded-xl bg-destructive/5 border border-destructive/15 px-3 sm:px-4 py-2.5 sm:py-3 flex items-start gap-2 sm:gap-3 shadow-sm shadow-destructive/5"
          >
            <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-destructive/15 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-destructive text-[10px] sm:text-[11px] font-bold">
                !
              </span>
            </div>
            <div className="flex flex-col gap-0.5 sm:gap-1 min-w-0 flex-1">
              <span className="text-[9px] sm:text-[10px] font-bold text-destructive dark:text-destructive/80 uppercase tracking-wider">
                Error Encountered
              </span>
              <p className="text-[11px] sm:text-xs text-foreground/90 dark:text-destructive/90 leading-relaxed font-medium break-words">
                {stream.error}
              </p>
            </div>
          </motion.div>
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
    </motion.div>
  );
});
