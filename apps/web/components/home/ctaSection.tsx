import { Button } from "@workspace/ui/components/button";
import { FlickeringGrid } from "@workspace/ui/components/flickering-grid";
import { AnimatedShinyText } from "@workspace/ui/components/animated-shiny-text";
import { ArrowRight } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

export function CTASection() {
    return (
        <section className="relative z-10 py-24 px-4 overflow-hidden">
            <div className="mx-auto max-w-5xl rounded-3xl bg-card/50 border border-border p-12 text-center text-foreground relative overflow-hidden group">
                <FlickeringGrid
                    className="absolute inset-0 z-0 [mask-image:radial-gradient(450px_circle_at_center,white,transparent)]"
                    squareSize={4}
                    gridGap={6}
                    color="#34D399"
                    maxOpacity={0.4}
                    flickerChance={0.1}
                />
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
                <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

                <div className="relative z-10">
                    <div
                        className={cn(
                            "group/badge inline-flex rounded-full border border-black/5 bg-neutral-100 text-base transition-all ease-in hover:cursor-pointer hover:bg-neutral-200 dark:border-white/5 dark:bg-neutral-900 dark:hover:bg-neutral-800 mb-6"
                        )}
                    >
                        <AnimatedShinyText className="inline-flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium transition ease-out hover:text-neutral-600 hover:duration-300 hover:dark:text-neutral-400">
                            <span>🚀</span>
                            <span>Start building today</span>
                            <ArrowRight className="ml-1 size-3.5 transition-transform duration-300 ease-in-out group-hover/badge:translate-x-0.5" />
                        </AnimatedShinyText>
                    </div>
                    <h2 className="mb-6 text-3xl font-bold tracking-tight md:text-5xl">Ready to ship your <br /> next big thing?</h2>
                    <p className="mb-10 text-lg text-muted-foreground max-w-xl mx-auto">
                        Experience the fastest way to build and deploy modern web applications with Edward&apos;s AI-driven workflow.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <Button size="lg" className="bg-primary rounded-full text-primary-foreground hover:bg-primary/90 h-12 px-8 text-base">
                            Get Started for Free
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    )
}
