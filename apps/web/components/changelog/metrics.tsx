"use client";

import { useMemo } from "react";
import { m } from "motion/react";
import { ChangelogIssue } from "@/lib/linear";
import { CheckCircle2, Hammer, Activity } from "lucide-react";

interface ChangelogMetricsProps {
    issues: ChangelogIssue[];
}

export function ChangelogMetrics({ issues }: ChangelogMetricsProps) {
    const metrics = useMemo(() => {
        const total = issues.length;
        const completed = issues.filter((i) => i.state.type === "completed").length;
        const inProgress = issues.filter((i) => i.state.type !== "completed").length;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentActivity = issues.filter(
            (i) => new Date(i.completedAt || i.updatedAt) > thirtyDaysAgo
        ).length;

        return { total, completed, inProgress, recentActivity };
    }, [issues]);

    const cards = [
        {
            label: "Shipped",
            value: metrics.completed,
            icon: CheckCircle2,
            color: "text-emerald-600 dark:text-emerald-500",
            bg: "bg-emerald-100 dark:bg-emerald-500/10",
            border: "border-emerald-200 dark:border-emerald-500/20",
        },
        {
            label: "In Progress",
            value: metrics.inProgress,
            icon: Hammer,
            color: "text-blue-600 dark:text-blue-500",
            bg: "bg-blue-100 dark:bg-blue-500/10",
            border: "border-blue-200 dark:border-blue-500/20",
        },
        {
            label: "Active (30d)",
            value: metrics.recentActivity,
            icon: Activity,
            color: "text-purple-600 dark:text-purple-500",
            bg: "bg-purple-100 dark:bg-purple-500/10",
            border: "border-purple-200 dark:border-purple-500/20",
        },
    ];

    if (issues.length === 0) return null;

    return (
        <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
            className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-12"
        >
            {cards.map((card) => {
                const Icon = card.icon;
                return (
                    <div
                        key={card.label}
                        className="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-border/40 bg-sidebar dark:bg-muted/10 p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 dark:hover:bg-sidebar/50"
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${card.bg} ${card.border}`}>
                                <Icon className={`h-4 w-4 ${card.color}`} />
                            </div>
                            <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">
                                {card.label}
                            </span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-3xl font-bold text-slate-900 dark:text-foreground tracking-tight">
                                {card.value}
                            </span>
                        </div>

                        {/* Subtle gradient shine effect on hover */}
                        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 dark:via-white/5 to-transparent group-hover:animate-shimmer" />
                    </div>
                );
            })}
        </m.div>
    );
}
