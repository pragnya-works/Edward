import Link from 'next/link';

export function Footer() {
    return (
        <footer className="relative z-10 py-16 px-4">
            <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
                <div className="md:col-span-2 space-y-4">
                    <span className="text-2xl font-bold tracking-tighter">Edward.</span>
                    <p className="text-muted-foreground max-w-xs text-sm leading-relaxed">
                        The AI-powered web application builder for the next generation of developers.
                        Build, ship, and scale with ease.
                    </p>
                </div>

                <div className="space-y-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider">Product</h4>
                    <ul className="space-y-2">
                        <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</Link></li>
                        <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</Link></li>
                        <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Changelog</Link></li>
                        <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Documentation</Link></li>
                    </ul>
                </div>

                <div className="space-y-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider">Company</h4>
                    <ul className="space-y-2">
                        <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">About Us</Link></li>
                        <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</Link></li>
                        <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</Link></li>
                        <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms of Service</Link></li>
                    </ul>
                </div>
            </div>

            <div className="mx-auto max-w-6xl mt-16 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="text-sm text-muted-foreground">
                    © {new Date().getFullYear()} Edward AI. All rights reserved.
                </div>
                <div className="flex gap-6">
                    <Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Twitter</Link>
                    <Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">GitHub</Link>
                    <Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Discord</Link>
                </div>
            </div>
        </footer>
    );
}
