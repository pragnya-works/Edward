import { Upload } from "lucide-react";
import { LazyMotion, domAnimation, m } from "motion/react";

export function DragDropOverlay() {
    return (
        <LazyMotion features={domAnimation}>
            <m.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute inset-0 z-50 flex items-center justify-center bg-muted/60 backdrop-blur-sm ring-2 ring-primary/20 rounded-2xl m-1"
            >
                <div className="flex items-center gap-2.5 text-primary">
                    <Upload className="h-5 w-5" />
                    <span className="text-sm font-medium">Drop to attach</span>
                </div>
            </m.div>
        </LazyMotion>
    );
}
