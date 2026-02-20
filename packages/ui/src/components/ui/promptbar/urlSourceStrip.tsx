import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
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
    <LazyMotion features={domAnimation}>
      <AnimatePresence mode="wait">
        {urls.length > 0 && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 sm:px-4 md:px-6 pb-2 sm:pb-2.5">
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/70 backdrop-blur-[2px] px-2.5 sm:px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-emerald-800 dark:text-emerald-200 font-medium">
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
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-500/45 bg-emerald-100/90 dark:bg-emerald-900/65 backdrop-blur-[1px] px-2 py-1 text-[10px] sm:text-[11px] text-emerald-900 dark:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900/75 transition-colors"
                    >
                      <Globe className="h-2.5 w-2.5 text-emerald-700/70 dark:text-emerald-300/70 shrink-0" />
                      <span className="max-w-[180px] truncate">{formatHost(url)}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
