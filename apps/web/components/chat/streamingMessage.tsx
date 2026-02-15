"use client";

import { memo, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ThinkingIndicator } from "./thinkingIndicator";
import { TypingIndicator } from "./typingIndicator";
import { FileBlock } from "./fileBlock";
import { CommandBlock } from "./commandBlock";
import { SandboxIndicator } from "./sandboxIndicator";
import { InstallBlock } from "./installBlock";
import { EdwardAvatar } from "./avatars";
import type { StreamState } from "@/lib/chatTypes";
import { Sparkles, Terminal, FileCode, Box } from "lucide-react";
import { MessageMetrics } from "./messageMetrics";

import { MarkdownRenderer } from "./markdownRenderer";

interface StreamingMessageProps {
  stream: StreamState;
}

export const StreamingMessage = memo(function StreamingMessage({
  stream,
}: StreamingMessageProps) {
  const hasAnyContent = useMemo(
    () =>
      stream.streamingText ||
      stream.thinkingText ||
      stream.activeFiles.length > 0 ||
      stream.completedFiles.length > 0 ||
      stream.isThinking ||
      stream.isSandboxing ||
      stream.command ||
      stream.installingDeps.length > 0,
    [stream],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="flex gap-4 items-start flex-row group"
    >
      <EdwardAvatar isActive />

      <div className="flex flex-col items-start gap-4 min-w-0 flex-1">
        {!hasAnyContent ? (
          <TypingIndicator isCodeMode={stream.codeOnly} />
        ) : null}

        <AnimatePresence>
          {stream.isSandboxing ? (
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

        <AnimatePresence>
          {stream.activeFiles.length > 0 ||
          stream.installingDeps.length > 0 ||
          stream.command ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-col gap-2 w-full border-l-2 border-sky-500/10 dark:border-sky-500/10 pl-4 my-1"
            >
              <div className="flex items-center gap-2 mb-1 text-[10px] font-semibold text-sky-600/50 dark:text-sky-400/40 uppercase tracking-widest">
                <Sparkles className="h-3 w-3" />
                <span>Active Operations</span>
              </div>

              {stream.activeFiles.map((file, i) => (
                <motion.div
                  key={file.path}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileCode className="h-3 w-3 text-sky-600/60 dark:text-sky-400/60" />
                    <span className="text-[11px] text-muted-foreground font-mono truncate">
                      Writing {file.path}...
                    </span>
                  </div>
                  <FileBlock file={file} index={i} />
                </motion.div>
              ))}

              {stream.installingDeps.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Box className="h-3 w-3 text-amber-400/60" />
                    <span className="text-[11px] text-muted-foreground/70 font-mono">
                      Installing dependencies...
                    </span>
                  </div>
                  <InstallBlock dependencies={stream.installingDeps} />
                </motion.div>
              ) : null}

              {stream.command ? (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Terminal className="h-3 w-3 text-emerald-400/60" />
                    <span className="text-[11px] text-muted-foreground/70 font-mono">
                      Executing command...
                    </span>
                  </div>
                  <CommandBlock command={stream.command} />
                </motion.div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {stream.streamingText ? (
          <div className="rounded-2xl text-[15px] leading-[1.8] tracking-tight font-medium text-foreground w-full relative group/text">
            <MarkdownRenderer content={stream.streamingText} />
            <motion.span
              className="inline-block w-[3px] h-4 bg-sky-500 dark:bg-sky-400/60 ml-0.5 rounded-full align-text-bottom"
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
          </div>
        ) : null}

        {stream.completedFiles.length > 0 ? (
          <div className="flex flex-col gap-3 w-full mt-2">
            {stream.completedFiles.map((file, i) => (
              <FileBlock key={file.path} file={file} index={i} />
            ))}
          </div>
        ) : null}

        {stream.error ? (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full rounded-xl bg-destructive/5 border border-destructive/15 px-4 py-3 flex items-start gap-3 shadow-sm shadow-destructive/5"
          >
            <div className="h-5 w-5 rounded-full bg-destructive/15 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-destructive text-[11px] font-bold">!</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-destructive dark:text-destructive/80 uppercase tracking-wider">
                Error Encountered
              </span>
              <p className="text-xs text-foreground/90 dark:text-destructive/90 leading-relaxed font-medium">
                {stream.error}
              </p>
            </div>
          </motion.div>
        ) : null}

        {stream.metrics ? (
          <div className="flex items-baseline gap-2 px-1 mt-1">
            <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest select-none leading-none">
              Edward
            </span>
            <span className="w-1 h-1 rounded-full bg-foreground/[0.05] self-center" />
            <div className="inline-flex translate-y-0.5">
              <MessageMetrics
                completionTime={stream.metrics.completionTime}
                inputTokens={stream.metrics.inputTokens}
                outputTokens={stream.metrics.outputTokens}
              />
            </div>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
});
