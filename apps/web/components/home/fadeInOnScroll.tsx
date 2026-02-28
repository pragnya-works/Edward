"use client";

import { m } from "motion/react";
import { ReactNode } from "react";

type FadeInStaggerProps = {
    children: ReactNode;
    className?: string;
    delay?: number;
    duration?: number;
    yOffset?: number;
};

export function FadeInOnScroll({ children, className, delay = 0, duration = 0.5, yOffset = 24 }: FadeInStaggerProps) {
    return (
        <m.div
            initial={{ opacity: 0, y: yOffset }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -50px 0px" }}
            transition={{ duration, delay, ease: "easeOut" }}
            className={className}
        >
            {children}
        </m.div>
    );
}
