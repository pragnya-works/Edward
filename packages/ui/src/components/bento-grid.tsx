import { ReactNode } from "react";
import { LucideIcon, ArrowRight } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";

function BentoGrid({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "grid w-full auto-rows-[22rem] grid-cols-1 md:grid-cols-3 gap-4",
                className,
            )}
        >
            {children}
        </div>
    );
}

function BentoCard({
    name,
    className,
    background,
    Icon,
    description,
    href,
    cta,
}: {
    name: string;
    className: string;
    background: ReactNode;
    Icon?: LucideIcon;
    description: string;
    href: string;
    cta: string;
}) {
    return (
        <div
            className={cn(
                "group relative flex flex-col justify-end overflow-hidden rounded-xl",
                "bg-card border border-border backdrop-blur-md",
                "transform-gpu shadow-sm transition-all duration-300 hover:shadow-xl",
                className,
            )}
        >
            <div className="absolute inset-0 z-0">{background}</div>
            <div className="pointer-events-none z-10 flex transform-gpu flex-col gap-1 p-6 transition-all duration-300 group-hover:-translate-y-10">
                {Icon && (
                    <Icon className="h-12 w-12 origin-left transform-gpu text-foreground/70 transition-all duration-300 ease-in-out group-hover:scale-75" />
                )}
                <h3 className="text-xl font-semibold text-foreground">
                    {name}
                </h3>
                <p className="max-w-lg text-muted-foreground">{description}</p>
            </div>

            <div
                className={cn(
                    "pointer-events-none absolute bottom-0 z-10 flex w-full translate-y-10 transform-gpu flex-row items-center p-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100",
                )}
            >
                <Button variant="ghost" asChild size="sm" className="pointer-events-auto text-foreground hover:bg-accent/50">
                    <a href={href}>
                        {cta}
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                </Button>
            </div>
            <div className="pointer-events-none absolute inset-0 transform-gpu transition-all duration-300 group-hover:bg-accent/5" />
        </div>
    );
}

export { BentoCard, BentoGrid };
