import { Check } from "lucide-react";
import { Button } from "@edward/ui/components/button";
import { DialogFooter } from "@edward/ui/components/dialog";

interface BYOKFooterProps {
  showSuccess: boolean;
  onClose: () => void;
  isSubmitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  isModelOnlyUpdate: boolean;
}

export function BYOKFooter({
  showSuccess,
  onClose,
  isSubmitting,
  canSubmit,
  onSubmit,
  isModelOnlyUpdate,
}: BYOKFooterProps) {
  return (
    <div className="shrink-0 flex flex-col">
      {showSuccess ? (
        <div className="px-6 py-4 animate-in fade-in slide-in-from-bottom-2 duration-300 border-t border-border/10 bg-emerald-500/[0.03]">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-center gap-2.5">
            <div className="h-5 w-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Check className="h-3 w-3 text-emerald-500" />
            </div>
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Credentials synchronized successfully.
            </p>
          </div>
        </div>
      ) : null}

      <DialogFooter className="px-6 py-4 bg-muted/40 dark:bg-white/[0.04] border-t border-border/50 dark:border-white/[0.08] sm:justify-start gap-2.5 backdrop-blur-sm">
        <Button
          type="button"
          variant="outline"
          className="flex-1 rounded-xl h-12 font-semibold bg-background dark:bg-white/[0.06] border-border/50 dark:border-white/[0.12] hover:bg-muted/50 dark:hover:bg-white/[0.1] transition-colors text-muted-foreground dark:text-foreground/70 hover:text-foreground"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancel
        </Button>

        <Button
          className="flex-1 rounded-xl h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md dark:shadow-lg dark:shadow-primary/10 transition-all active:scale-[0.98]"
          onClick={onSubmit}
          disabled={!canSubmit}
        >
          {isSubmitting ? (
            <div className="flex items-center gap-2.5">
              <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              <span className="tracking-tight">Initializing…</span>
            </div>
          ) : (
            <span className="tracking-tight">
              {isModelOnlyUpdate ? "Save Preferences" : "Save API Key"}
            </span>
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}
