import { Check } from "lucide-react";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@edward/ui/components/dialog";
import { Provider, PROVIDER_DISPLAY_NAME } from "@edward/shared/constants";

interface BYOKHeaderProps {
  hasExistingKey: boolean;
  keyPreview: string | null;
  existingKeyProvider: Provider | null;
}

export function BYOKHeader({
  hasExistingKey,
  keyPreview,
  existingKeyProvider,
}: BYOKHeaderProps) {
  return (
    <div className="p-5 pb-3 border-b border-border/20 dark:border-white/[0.08] bg-background/50 dark:bg-white/[0.025] backdrop-blur-sm shrink-0">
      <DialogHeader className="gap-1">
        <DialogTitle className="text-xl font-bold tracking-tight text-foreground/90">
          {hasExistingKey ? "Manage Your API Key" : "Add Your API Key"}
        </DialogTitle>
        <DialogDescription className="space-y-2">
          <span className="block italic text-muted-foreground/60 dark:text-muted-foreground/70">
            {hasExistingKey
              ? "Update your API key to continue using the service."
              : "Select a provider and enter your API key to get started."}
          </span>
        </DialogDescription>
      </DialogHeader>

      {hasExistingKey && keyPreview ? (
        <div className="mt-3 rounded-xl border border-border/40 dark:border-white/[0.1] bg-muted/30 dark:bg-white/[0.05] p-3 shadow-inner">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground/50 dark:text-muted-foreground/70 uppercase tracking-widest">
                Active key
              </p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm tracking-tight text-foreground/70 dark:text-foreground/90">
                  {keyPreview}
                </p>
                {existingKeyProvider ? (
                  <span className="rounded-full border border-border/60 dark:border-white/[0.15] bg-background/70 dark:bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground dark:text-foreground/60">
                    {PROVIDER_DISPLAY_NAME[existingKeyProvider]}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-sm shadow-emerald-500/5">
              <Check className="h-4 w-4 text-emerald-500" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
