import { ReactNode, memo } from "react";
import { LucideIcon } from "lucide-react";

import { cn } from "@edward/ui/lib/utils";

const BentoGrid = memo(function BentoGrid({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "grid w-full grid-cols-1 md:grid-cols-3 gap-4 md:auto-rows-[22rem]",
                "contain-layout",
                className,
            )}
        >
            {children}
        </div>
    );
});

const BentoCard = memo(function BentoCard({
    name,
    className,
    background,
    Icon,
    description,
}: {
    name: string;
    className: string;
    background: ReactNode;
    Icon?: LucideIcon;
    description: string;
}) {
    return (
        <div
            className={cn(
                "group relative flex flex-col justify-end overflow-hidden rounded-2xl",
                "bg-card border border-white/10 dark:border-white/10 backdrop-blur-md",
                "transform-gpu hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:border-white/20",
                "transition-[box-shadow,border-color,transform,background-color] duration-300", // Avoid transition-all
                "will-change-transform will-change-[box-shadow]", // GPU hint
                "min-h-[18rem] md:min-h-0",
                "content-visibility-auto", // Layout optimization
                className,
            )}
        >
            <div className="absolute inset-0 z-0">{background}</div>
            <div className="pointer-events-none absolute inset-0 z-20 rounded-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] group-hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.25)] transition-shadow duration-300" />
            <div className="pointer-events-none z-10 flex transform-gpu flex-col gap-1 p-4 md:p-6 transition-[transform,opacity] duration-300">
                {Icon && (
                    <Icon className="h-8 w-8 md:h-12 md:w-12 origin-left transform-gpu text-foreground/70 transition-transform duration-300 ease-in-out md:group-hover:scale-75" />
                )}
                <h3 className="text-lg md:text-xl font-semibold text-foreground">
                    {name}
                </h3>
                <p className="max-w-lg text-sm md:text-base text-muted-foreground">{description}</p>
            </div>
            <div className="pointer-events-none absolute inset-0 transform-gpu transition-colors duration-300 group-hover:bg-accent/5" />
        </div>
    );
});

export { BentoCard, BentoGrid };
