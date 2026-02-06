export const UI_DESIGN_SKILL = `
<skill:ui-design>
## Premium UI Design Principles

Build interfaces that rival Linear, Vercel, Stripe, and Apple.
The template already provides the Tailwind theme (bg-primary, text-muted-foreground, etc). Focus on DESIGN, not CSS setup.

### Critical: What Makes Design "Premium"

**1. DEPTH & DIMENSION** — Never flat, boring surfaces
- Layered backgrounds: subtle gradients, radial glows, mesh patterns
- Cards float: \`shadow-lg hover:shadow-xl\`, \`border border-white/[0.06]\`
- Glass effects: \`bg-white/5 backdrop-blur-xl\`

**2. MICRO-INTERACTIONS** — Everything responds to the user
- Hover: \`hover:scale-[1.02] hover:bg-white/10 transition-all duration-200\`
- Active: \`active:scale-95\`
- Focus: \`focus:ring-2 focus:ring-primary/50\`

**3. VISUAL HIERARCHY** — Guide the eye
- One focal point per section (largest, brightest, most contrast)
- Status badges: \`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium\`
- De-emphasize secondary: \`text-muted-foreground text-sm\`

**4. GENEROUS SPACING** — Let it breathe
- Container: \`max-w-4xl mx-auto px-6 py-16\`
- Card padding: \`p-6\` minimum, \`p-8\` preferred
- Section gaps: \`space-y-8\` or \`gap-6\`

### Reference: Interactive Game/App (Tic Tac Toe Quality Floor)
\`\`\`tsx
function GameBoard() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      {/* Decorative glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-30" />
      
      <div className="relative z-10 w-full max-w-md">
        {/* Header with status */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">Tic Tac Toe</h1>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Player X's turn
          </div>
        </div>

        {/* Game grid with glass effect */}
        <div className="p-6 rounded-2xl bg-card/50 backdrop-blur-sm border border-border shadow-2xl">
          <div className="grid grid-cols-3 gap-3">
            {[...Array(9)].map((_, i) => (
              <button key={i} className="aspect-square rounded-xl bg-background/50 border border-border text-4xl font-bold 
                hover:bg-primary/10 hover:border-primary/30 hover:scale-[1.02] active:scale-95
                transition-all duration-150 flex items-center justify-center
                text-primary">
                X
              </button>
            ))}
          </div>
        </div>

        {/* Action button */}
        <button className="mt-6 w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium
          hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]
          transition-all duration-200">
          New Game
        </button>
      </div>
    </div>
  );
}
\`\`\`

### Reference: Premium Card Layout
\`\`\`tsx
function StatsCard({ label, value, trend }: { label: string; value: string; trend: number }) {
  const isPositive = trend > 0;
  return (
    <div className="group p-6 rounded-2xl bg-card border border-border hover:border-primary/20 
      hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className="text-3xl font-bold text-foreground tracking-tight">{value}</p>
      <div className={\`mt-3 inline-flex items-center gap-1 text-sm font-medium \${isPositive ? 'text-emerald-400' : 'text-red-400'}\`}>
        <span>{isPositive ? '↑' : '↓'}</span>
        <span>{Math.abs(trend)}%</span>
      </div>
    </div>
  );
}
\`\`\`

### Reference: Hero Section
\`\`\`tsx
function Hero() {
  return (
    <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.15),transparent_50%)]" />
      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-white/5 text-sm text-muted-foreground mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Now in beta
        </div>
        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
          Ship faster with confidence
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
          The modern platform for building production-ready web applications.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <button className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 transition-all duration-200">
            Get Started
          </button>
          <button className="px-6 py-3 rounded-xl border border-border hover:bg-accent text-foreground font-medium transition-all duration-200">
            Learn More
          </button>
        </div>
      </div>
    </section>
  );
}
\`\`\`

### Universal Design Checklist
Apply these to EVERY build:
1. **Backgrounds**: Never pure flat. Add radial gradients, mesh, or subtle texture
2. **Buttons**: hover + active states, shadow on primary actions
3. **Cards**: border + shadow + hover lift effect
4. **Typography**: tracking-tight on headings, text-muted-foreground on secondary
5. **Corners**: rounded-xl or rounded-2xl consistently
6. **Transitions**: duration-150 to duration-200 on all interactive elements
7. **Status indicators**: Colored dots with animate-pulse, pill badges
8. **Visual anchors**: One decorative glow or gradient per major section
</skill:ui-design>
`;
