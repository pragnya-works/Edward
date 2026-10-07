import Link from 'next/link';
import { EdwardLogo } from "@edward/ui/components/brand/edwardLogo";
import { FadeInOnScroll } from "./fadeInOnScroll";

export function Footer() {
    return (
        <footer className="relative z-10 py-16 px-4">
            <FadeInOnScroll className="mx-auto max-w-6xl">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <EdwardLogo
                            size={32}
                            priority
                            quality={78}
                            sizes="32px"
                            className="rounded-lg"
                        />
                        <span className="text-2xl font-bold tracking-tighter text-foreground">Edward.</span>
                    </div>
                    <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
                        Describe an app and Edward plans the change, writes the
                        code, runs it in a sandbox, and hands you a live preview
                        to keep editing.
                    </p>
                </div>
            </FadeInOnScroll>

            <div className="mx-auto max-w-6xl mt-16 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="text-sm text-muted-foreground">
                    © {new Date().getFullYear()} Edward.
                </div>
                <div className="flex flex-wrap gap-6">
                    <Link href="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">About</Link>
                    <Link href="/changelog" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Changelog</Link>
                    <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
                    <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
                    <Link href="https://github.com/pragnya-works/Edward" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">GitHub</Link>
                </div>
            </div>
        </footer>
    );
}
