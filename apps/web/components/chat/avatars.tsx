import { m } from "motion/react";

interface EdwardAvatarProps {
  isActive?: boolean;
}

export const EdwardAvatar = ({ isActive }: EdwardAvatarProps = {}) => (
  <div className="relative shrink-0">
    <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center shadow-sm">
      <div className="h-2.5 w-3 sm:h-3 sm:w-3.5 bg-white rounded-br-md sm:rounded-br-md rounded-tr-[2px] rounded-tl-md sm:rounded-tl-md rounded-bl-[2px]" />
    </div>
    {isActive && (
      <m.div
        className="absolute -inset-[2px] sm:-inset-[3px] rounded-[8px] sm:rounded-[10px] border border-sky-500/40 dark:border-sky-400/30"
        animate={{
          opacity: [0.3, 0.7, 0.3],
          boxShadow: [
            "0 0 0 0 rgba(56, 189, 248, 0)",
            "0 0 6px 1px rgba(56, 189, 248, 0.15)",
            "0 0 0 0 rgba(56, 189, 248, 0)",
          ],
        }}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    )}
  </div>
);
