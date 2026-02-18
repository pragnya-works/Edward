import { motion, AnimatePresence } from "motion/react";
import { Link2, Globe } from "lucide-react";

interface UrlSourceStripProps {
  urls: string[];
}

function formatHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function UrlSourceStrip({ urls }: UrlSourceStripProps) {
  return (
    <AnimatePresence mode="wait">
      {urls.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div className="px-3 sm:px-4 md:px-6 pb-2 sm:pb-2.5">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-2.5 sm:px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-emerald-700/80 dark:text-emerald-300/80 font-medium">
                <Link2 className="h-3 w-3 shrink-0" />
                <span>Up to 6 URL sources will be scraped automatically before generation.</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {urls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/60 px-2 py-1 text-[10px] sm:text-[11px] text-foreground/80 hover:bg-background transition-colors"
                  >
                    <Globe className="h-2.5 w-2.5 text-foreground/50 shrink-0" />
                    <span className="max-w-[180px] truncate">{formatHost(url)}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
