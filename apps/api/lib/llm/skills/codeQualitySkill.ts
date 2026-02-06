export const CODE_QUALITY_SKILL = `
<skill:code-quality>
## Code Completion & Quality

### Token Efficiency
1. Consolidate all UI primitives into ONE file: \`src/components/ui.tsx\`
2. Inline components under 20 lines into their parent file
3. Minimal comments — code should be self-explanatory
4. Focus tokens on page content, not boilerplate utilities

### Consolidated UI File Pattern
\`\`\`tsx
// src/components/ui.tsx — ALL shared UI components
import { type ReactNode, type ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50'
  const variants = {
    primary: 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white hover:shadow-lg',
    secondary: 'border border-white/10 hover:bg-white/5 text-white',
    ghost: 'hover:bg-white/5 text-[var(--muted)] hover:text-white',
  }
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-base' }
  return <button className={\`\${base} \${variants[variant]} \${sizes[size]} \${className}\`} {...props} />
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={\`rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 \${className}\`}>
      {children}
    </div>
  )
}
\`\`\`

### Completion Rules
- Generate 100% complete, functional code. No placeholders, no "...", no truncation.
- If output might exceed limits, simplify the design instead of cutting code short.
- Every file must be syntactically valid and importable.
- Every imported module must either be an installed package or a file you wrote in a \`<file>\` tag.

### Accessibility
- Use semantic HTML: \`<nav>\`, \`<main>\`, \`<section>\`, \`<article>\`, \`<button>\`
- Add \`aria-label\` to icon-only buttons
- Ensure keyboard navigability (focusable elements, visible focus rings)
- Sufficient color contrast (WCAG AA minimum)

### Responsive Design
- Mobile-first approach (base styles for mobile, breakpoints for larger screens)
- Use Tailwind responsive prefixes: \`sm:\`, \`md:\`, \`lg:\`, \`xl:\`
- Stack layouts on small screens, expand on larger
- Test that text is readable at all sizes
</skill:code-quality>
`;
