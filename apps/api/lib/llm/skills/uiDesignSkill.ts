export const UI_DESIGN_SKILL = `
<skill:ui-design>
## Distinctive Frontend Design Intelligence

Create production-grade interfaces that are visually striking, memorable, and avoid generic "AI slop" aesthetics.
The template provides the Tailwind theme (bg-primary, text-muted-foreground, etc). Focus on BOLD, INTENTIONAL design, not CSS setup.

---

### PHASE 1: Design Thinking (Before Writing Code)

Before coding, commit to a BOLD aesthetic direction:

1. **Purpose**: What problem does this interface solve? Who uses it?
2. **Product Category**: Identify the type (SaaS, e-commerce, portfolio, dashboard, healthcare, fintech, etc.)
3. **Aesthetic Tone**: Pick a DISTINCTIVE direction — brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, cyberpunk, glassmorphic, neubrutalist, etc.
4. **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute with precision. Bold maximalism and refined minimalism both work — the key is INTENTIONALITY, not intensity. Match implementation complexity to the aesthetic vision.

---

### PHASE 2: Product-Aware Design System Selection

Select style, colors, typography, and effects based on the product category:

#### Style Selection by Product Type (Top Categories)

| Product Type | Recommended Pattern | Style Priority | Color Mood | Typography Mood | Key Effects |
|---|---|---|---|---|---|
| SaaS (General) | Hero + Features + CTA | Glassmorphism + Flat | Trust blue + Accent contrast | Professional + Hierarchy | Subtle hover (200-250ms) + Smooth transitions |
| E-commerce | Feature-Rich Showcase | Vibrant & Block-based | Brand primary + Success green | Engaging + Clear hierarchy | Card hover lift (200ms) + Scale effect |
| E-commerce Luxury | Feature-Rich Showcase | Liquid Glass + Glassmorphism | Premium colors + Minimal accent | Elegant + Refined | Chromatic aberration + Fluid animations (400-600ms) |
| Healthcare | Social Proof-Focused | Neumorphism + Accessible | Calm blue + Health green | Readable + Large type (16px+) | Soft box-shadow + Smooth press (150ms) |
| Fintech/Crypto | Conversion-Optimized | Glassmorphism + Dark Mode | Dark tech + Vibrant accents | Modern + Confident | Real-time chart animations + Alert pulse/glow |
| Portfolio/Personal | Storytelling-Driven | Motion-Driven + Minimalism | Brand primary + Artistic | Expressive + Variable | Parallax (3-5 layers) + Scroll-triggered reveals |
| Dashboard/Analytics | Data-Dense Dashboard | Data-Dense + Heat Map | Cool→Hot gradients + Neutral grey | Clear + Readable | Hover tooltips + Chart zoom + Real-time pulse |
| Creative Agency | Storytelling-Driven | Brutalism + Motion-Driven | Bold primaries + Artistic freedom | Bold + Expressive | CRT scanlines + Neon glow + Glitch effects |
| Education | Feature-Rich Showcase | Claymorphism + Micro-interactions | Playful colors + Clear hierarchy | Friendly + Engaging | Soft press (200ms) + Fluffy elements |
| Startup Landing | Hero-Centric + Trust | Motion-Driven + Vibrant & Block | Bold primaries + Accent contrast | Modern + Energetic | Scroll-triggered animations + Parallax |
| Gaming | Feature-Rich Showcase | 3D & Hyperrealism + Retro-Futurism | Vibrant + Neon + Immersive | Bold + Impactful | WebGL 3D rendering + Glitch effects |
| Restaurant/Food | Hero-Centric + Conversion | Vibrant & Block + Motion-Driven | Warm colors (Orange Red Brown) | Appetizing + Clear | Food image reveal + Menu hover effects |
| AI/Chatbot Platform | Interactive Demo + Minimal | AI-Native UI + Minimalism | Neutral + AI accent | Modern + Clear | Streaming text + Typing indicators + Fade-in |
| Wellness/Mental Health | Social Proof-Focused | Neumorphism + Accessible | Calm Pastels + Trust colors | Calming + Readable | Soft press + Breathing animations |
| Real Estate | Hero-Centric + Feature-Rich | Glassmorphism + Minimalism | Trust Blue + Gold + White | Professional + Confident | 3D property tour zoom + Map hover |

#### Decision Rules
- If UX-focused → prioritize minimalism
- If data-heavy → add glassmorphism for depth
- If luxury → switch to liquid glass + premium animations (400-600ms)
- If conversion-focused → add urgency colors
- If accessibility-required → must be WCAG AAA compliant
- If real-time data → add streaming/live indicators

#### Anti-Patterns by Product Type
- SaaS: Avoid excessive animation + dark mode by default
- Healthcare: Avoid bright neon + motion-heavy animations + AI purple/pink gradients
- Fintech: Avoid light backgrounds + no security indicators
- Government: Avoid ornate design + low contrast + motion effects
- B2B Enterprise: Avoid playful design + hidden features + AI purple/pink gradients

---

### PHASE 3: Available UI Styles Reference (68+ Styles)

| Style | Best For | Key Effects | CSS Essentials |
|---|---|---|---|
| **Minimalism** | Enterprise, dashboards, docs | Subtle hover (200-250ms), sharp shadows | \`display: grid; gap: 2rem; color: #000 or #FFF\` |
| **Glassmorphism** | Modern SaaS, financial, modals | Backdrop blur (10-20px), translucent overlays | \`backdrop-filter: blur(15px); background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2)\` |
| **Neumorphism** | Health/wellness, meditation | Soft box-shadow (multiple layers), smooth press | \`border-radius: 14px; box-shadow: -5px -5px 15px, 5px 5px 15px\` |
| **Brutalism** | Portfolios, counter-culture, editorial | No transitions, sharp corners, bold type 700+ | \`border-radius: 0px; transition: none; font-weight: 700+\` |
| **Neubrutalism** | Gen Z, startups, Figma-style | Hard shadows (4px offset), thick borders | \`border: 3px solid black; box-shadow: 5px 5px 0px black; no gradients\` |
| **Claymorphism** | Education, children's, creative | Inner+outer shadows, soft bounce | \`border-radius: 20px; border: 3-4px; double shadows\` |
| **Dark Mode (OLED)** | Night apps, coding, entertainment | Minimal glow, neon accents | \`background: #000000 or #121212; color: #FFFFFF; text-shadow: neon\` |
| **Vibrant & Block** | Startups, gaming, youth | Large sections (48px+ gaps), animated patterns | \`font-size: 32px+; gap: 48px+; neon/vibrant colors\` |
| **Aurora UI** | Creative agencies, branding, hero sections | Flowing gradients (8-12s loops) | \`conic-gradient; animation: 8-12s; blend-mode: screen\` |
| **Retro-Futurism** | Gaming, entertainment, tech | CRT scanlines, neon glow, glitch effects | \`text-shadow: neon; font-family: monospace; animation: glitch\` |
| **Liquid Glass** | Premium SaaS, luxury, creative | Morphing (400-600ms), chromatic aberration | \`SVG morph; filter: hue-rotate; backdrop-filter: blur + saturate\` |
| **Motion-Driven** | Portfolios, storytelling, interactive | Scroll animations, parallax (3-5 layers) | \`IntersectionObserver; will-change: transform; scroll-behavior: smooth\` |
| **Bento Box Grid** | Dashboards, Apple-style, features | Hover scale (1.02), soft shadows | \`display: grid; varied spans; border-radius: 24px; #F5F5F7 bg\` |
| **AI-Native UI** | Chatbots, copilots, voice | Typing indicators, streaming text | \`chat layout; 3-dot pulse; streaming overflow animation\` |
| **Cyberpunk** | Gaming, crypto, sci-fi | Neon glow, glitch, scanlines | \`background: #0D0D0D; color: #00FF00; monospace; scanlines overlay\` |
| **Organic Biophilic** | Wellness, sustainability, eco | Rounded curves, natural textures | \`border-radius: 16-24px; earth tones; SVG organic shapes\` |
| **Exaggerated Minimalism** | Fashion, architecture, luxury | Oversized type, extreme whitespace | \`font-size: clamp(3rem, 10vw, 12rem); font-weight: 900; padding: 8rem+\` |
| **HUD / Sci-Fi FUI** | Space tech, cybersecurity | Thin lines (1px), scanning animations | \`border: 1px rgba(0,255,255,0.5); monospace; glow effects\` |
| **E-Ink / Paper** | Reading apps, journals, calm | No animations, high contrast, paper texture | \`background: #FDFBF7; color: #1A1A1A; font: serif; transition: none\` |
| **Soft UI Evolution** | Modern SaaS, wellness, hybrid | Improved shadows, WCAG AA+ | \`box-shadow: softer blend; border-radius: 10px; 200-300ms\` |
| **Accessible & Ethical** | Government, healthcare, public | Focus rings (3-4px), ARIA, skip links | \`contrast: 7:1+; font-size: 16px+; touch-target: 44x44px\` |

---

### PHASE 4: Typography (Never Use Generic Fonts)

**NEVER** use: Inter, Roboto, Arial, system fonts as primary choices. Pick distinctive, characterful fonts.

#### Font Pairings by Context

| Context | Heading Font | Body Font | Mood |
|---|---|---|---|
| Luxury/Editorial | Playfair Display | Inter or Libre Baskerville | Elegant, sophisticated |
| Tech Startup | Space Grotesk | DM Sans | Modern, innovative |
| Bold Statement | Bebas Neue | Source Sans 3 | Impactful, dramatic |
| Wellness/Calm | Lora | Raleway | Calming, organic |
| Developer Tools | JetBrains Mono | IBM Plex Sans | Technical, precise |
| Playful/Creative | Fredoka | Nunito | Friendly, fun |
| Fashion Forward | Syne | Manrope | Avant-garde, edgy |
| Retro Vintage | Abril Fatface | Merriweather | Nostalgic, dramatic |
| Corporate Trust | Lexend | Source Sans 3 | Accessible, professional |
| Real Estate Luxury | Cinzel | Josefin Sans | Refined, premium |
| Crypto/Web3 | Orbitron | Exo 2 | Futuristic, digital |
| Gaming Bold | Russo One | Chakra Petch | Energetic, action |
| Art Deco | Poiret One | Didact Gothic | Vintage, decorative |
| Magazine Editorial | Libre Bodoni | Public Sans | Print-inspired, refined |
| Brutalist Raw | Space Mono | Space Mono | Raw, technical |
| Neubrutalist Bold | Lexend Mega | Public Sans | Loud, geometric |
| Indie/Craft | Amatic SC | Cabin | Handwritten, artisan |
| Accessibility First | Atkinson Hyperlegible | Atkinson Hyperlegible | Inclusive, clear |
| Luxury Minimalist | Bodoni Moda | Jost | High-contrast elegance |
| Sports/Fitness | Barlow Condensed | Barlow | Athletic, condensed |

**Rules**: 
- Pair a distinctive DISPLAY font with a refined BODY font
- Use tracking-tight (-0.025em to -0.05em) on headings
- Body text: line-height 1.5-1.75, limit 65-75 chars per line
- Minimum 16px body text on mobile
- NEVER converge on the same font across different generations

---

### PHASE 5: Color Palettes by Product Type

Select contextually appropriate colors. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.

| Product Type | Primary | CTA | Background | Notes |
|---|---|---|---|---|
| SaaS General | #2563EB | #F97316 | #F8FAFC | Trust blue + orange CTA |
| E-commerce | #059669 | #F97316 | #ECFDF5 | Success green + urgency orange |
| E-commerce Luxury | #1C1917 | #CA8A04 | #FAFAF9 | Premium dark + gold |
| Healthcare | #0891B2 | #059669 | #ECFEFF | Calm cyan + health green |
| Fintech/Crypto | #F59E0B | #8B5CF6 | #0F172A | Gold trust + purple tech |
| Creative Agency | #EC4899 | #06B6D4 | #FDF2F8 | Bold pink + cyan accent |
| Gaming | #7C3AED | #F43F5E | #0F0F23 | Neon purple + rose action |
| AI/Chatbot | #7C3AED | #06B6D4 | #FAF5FF | AI purple + cyan interactions |
| Beauty/Spa | #EC4899 | #8B5CF6 | #FDF2F8 | Soft pink + lavender luxury |
| Restaurant/Food | #DC2626 | #CA8A04 | #FEF2F2 | Appetizing red + warm gold |
| Real Estate | #0F766E | #0369A1 | #F0FDFA | Trust teal + professional blue |
| Cybersecurity | #00FF41 | #FF3333 | #000000 | Matrix green + alert red |
| Sustainability | #059669 | #FBBF24 | #ECFDF5 | Nature green + solar gold |

Use CSS variables for consistency:
\`\`\`css
:root { --primary: #2563EB; --cta: #F97316; --bg: #F8FAFC; --text: #1E293B; --border: #E2E8F0; }
\`\`\`

---

### PHASE 6: Core Design Principles

**1. DEPTH & DIMENSION** — Never flat, boring surfaces
- Layered backgrounds: subtle gradients, radial glows, mesh patterns, noise textures
- Cards float: \`shadow-lg hover:shadow-xl\`, \`border border-white/[0.06]\`
- Glass effects: \`bg-white/5 backdrop-blur-xl\`
- Create atmosphere: gradient meshes, geometric patterns, layered transparencies, grain overlays

**2. MOTION & MICRO-INTERACTIONS** — High-impact moments over scattered effects
- Hover: \`hover:scale-[1.02] hover:bg-white/10 transition-all duration-200\`
- Active: \`active:scale-95\`
- Focus: \`focus:ring-2 focus:ring-primary/50\`
- Prioritize: One well-orchestrated page load with staggered reveals (animation-delay) > scattered micro-interactions
- Use scroll-triggering and hover states that surprise
- Duration guidelines: 150-300ms for micro-interactions, 300-400ms for page/content, 400-600ms for premium/luxury
- ALWAYS respect \`prefers-reduced-motion\`

**3. SPATIAL COMPOSITION** — Break the predictable
- Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements
- Generous negative space OR controlled density (intentional choice)
- One focal point per section (largest, brightest, most contrast)
- Status badges: \`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium\`

**4. BACKGROUNDS & VISUAL DETAILS** — Create atmosphere, never default solid
- Apply contextual effects matching the overall aesthetic
- Gradient meshes, noise textures, geometric patterns, dramatic shadows
- Decorative borders, custom cursors, grain overlays
- One decorative glow or gradient per major section

**5. GENEROUS SPACING** — Let it breathe
- Container: \`max-w-4xl mx-auto px-6 py-16\`
- Card padding: \`p-6\` minimum, \`p-8\` preferred
- Section gaps: \`space-y-8\` or \`gap-6\`
- Floating navbar: \`top-4 left-4 right-4\` spacing (not glued to edges)

---

### PHASE 7: Common Rules for Professional UI

#### Icons & Visual Elements
- **No emoji icons** → Use SVG icons (Heroicons, Lucide, Simple Icons)
- **Stable hover states** → Use color/opacity transitions, NOT scale transforms that shift layout
- **Correct brand logos** → Research official SVG from Simple Icons
- **Consistent icon sizing** → Fixed viewBox (24x24) with w-6 h-6

#### Interaction & Cursor
- Add \`cursor-pointer\` to ALL clickable/hoverable elements
- Provide visual feedback (color, shadow, border) on hover
- Smooth transitions: \`transition-colors duration-200\` (never >500ms)

#### Light/Dark Mode Contrast
- Light mode glass cards: \`bg-white/80\` or higher opacity (not \`bg-white/10\`)
- Light mode text: \`#0F172A\` (slate-900), NOT \`#94A3B8\` (slate-400)
- Muted text light: \`#475569\` (slate-600) minimum
- Borders: \`border-gray-200\` in light, \`border-white/10\` in dark

#### Layout & Spacing
- Account for fixed navbar height in content padding
- Consistent max-width (\`max-w-6xl\` or \`max-w-7xl\`)
- Use theme colors directly (\`bg-primary\`) not \`var()\` wrapper

---

### PHASE 8: Accessibility Checklist (CRITICAL)

**Priority 1 — Must Have:**
- Minimum 4.5:1 contrast ratio for normal text (7:1 for AAA)
- Visible focus rings on interactive elements (3-4px)
- Descriptive alt text for meaningful images
- \`aria-label\` for icon-only buttons
- Tab order matches visual order
- \`label\` with \`for\` attribute on forms
- Minimum 44x44px touch targets
- \`prefers-reduced-motion\` respected

**Priority 2 — Should Have:**
- Skip links for keyboard navigation
- Semantic HTML (\`<nav>\`, \`<main>\`, \`<section>\`, \`<article>\`)
- Color is NEVER the only indicator (add icons, patterns, text)
- Form error messages near the problem field

---

### PHASE 9: Pre-Delivery Checklist

#### Visual Quality
- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent set (Heroicons/Lucide)
- [ ] Hover states don't cause layout shift
- [ ] Background has depth (gradient, texture, glow — never pure flat)
- [ ] Typography uses distinctive fonts, not generic defaults

#### Interaction
- [ ] All clickable elements have \`cursor-pointer\`
- [ ] Hover states provide clear visual feedback
- [ ] Transitions 150-300ms, smooth
- [ ] Focus states visible for keyboard navigation
- [ ] Buttons have hover + active states + shadow on primary

#### Light/Dark Mode
- [ ] Light mode text has sufficient contrast (4.5:1 minimum)
- [ ] Glass/transparent elements visible in light mode
- [ ] Borders visible in both modes

#### Layout
- [ ] No content hidden behind fixed navbars
- [ ] Responsive at 375px, 768px, 1024px, 1440px
- [ ] No horizontal scroll on mobile
- [ ] Cards have border + shadow + hover lift

#### Accessibility
- [ ] All images have alt text
- [ ] Form inputs have labels
- [ ] Color is not the only indicator
- [ ] \`prefers-reduced-motion\` respected
- [ ] Touch targets ≥ 44x44px

---

### ANTI-PATTERNS — NEVER DO THESE

1. **Generic AI aesthetics**: Overused Inter/Roboto fonts, purple gradients on white, predictable layouts
2. **AI purple/pink gradient syndrome**: The clichéd purple-to-pink gradient that screams "AI generated"
3. **Cookie-cutter components**: Every card looking identical, no personality
4. **Flat without intention**: Solid color backgrounds with no depth, texture, or atmosphere
5. **Animation overload**: Too many scattered micro-interactions instead of orchestrated reveals
6. **Convergent design**: Always picking the same fonts (Space Grotesk), same colors, same layout
7. **Ignoring product context**: A fintech app looking like a children's game
8. **Dark mode by default**: Unless specifically appropriate (OLED, entertainment, coding)

**Remember**: Every design should feel GENUINELY CRAFTED for its specific context. Vary between light/dark themes, different fonts, different aesthetics. No two designs should look the same. Commit fully to a distinctive vision.

### Reference: Interactive Game/App (Tic Tac Toe Quality Floor)
\`\`\`tsx
function GameBoard() {
  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
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
        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight bg-linear-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
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
</skill:ui-design>
`;
