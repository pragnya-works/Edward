import { m } from "motion/react";
import { EdwardLogo } from "@edward/ui/components/brand/edwardLogo";

interface EdwardAvatarProps {
  isActive?: boolean;
}

export const EdwardAvatar = ({ isActive }: EdwardAvatarProps = {}) => (
  <div className="relative shrink-0">
    <EdwardLogo
      size={28}
      quality={68}
      sizes="(max-width: 640px) 24px, 28px"
      className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg shadow-sm"
    />
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
