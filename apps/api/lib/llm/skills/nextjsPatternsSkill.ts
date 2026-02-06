export const NEXTJS_PATTERNS_SKILL = `
<skill:nextjs>
## Next.js App Router Patterns

### Required Entry Points
Your project MUST include these files:
1. \`src/app/layout.tsx\` — Root layout (imports \`./globals.css\`)
2. \`src/app/page.tsx\` — Home page (Server Component by default)
3. \`src/app/globals.css\` — Tailwind v4 styles (template provides this)

### Layout Template (Copy This Pattern)
\`\`\`tsx
// src/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'App Title',
  description: 'App description',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
\`\`\`

### Import Paths (Relative Only)
| From file                      | Import components from         |
|-------------------------------|-------------------------------|
| \`src/app/page.tsx\`             | \`../components/ui\`            |
| \`src/app/layout.tsx\`           | \`../components/ui\`            |
| \`src/app/about/page.tsx\`       | \`../../components/ui\`         |
| \`src/components/header.tsx\`    | \`./ui\`                        |

Always use relative paths. The \`@/\` alias may not be configured.

### Server vs Client Components
- Pages and layouts are Server Components by default. Keep them that way.
- When you need \`useState\`, \`useEffect\`, \`useTheme\`, or event handlers:
  1. Create a separate file with \`'use client'\` at the top
  2. Import it into the server page

\`\`\`tsx
// src/components/theme-toggle.tsx
'use client'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-lg hover:bg-white/5 transition-colors">
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
\`\`\`

### Theme Support
ThemeProvider is pre-configured in \`src/components/providers.tsx\`. It already wraps children in layout.
If you need theme-aware components, create a Client Component (as shown above) and import it.

### Font Loading
Load fonts via CSS \`<link>\` tags in the \`<head>\` of layout.tsx (as shown in template above).
Use the loaded font in globals.css or Tailwind classes.

### Performance Patterns
- Use \`Promise.all()\` for parallel data fetching in server components
- Use \`next/dynamic\` for heavy client components (charts, editors, maps)
- Minimize data passed from server to client components
- Keep client components small and focused on interactivity
</skill:nextjs>
`;
