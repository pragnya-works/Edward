export const VITE_PATTERNS_SKILL = `
<skill:vite>
## Vite React Patterns

### Required Entry Points
Your project MUST include these files:
1. \`src/main.tsx\` — Entry point (imports \`./index.css\` and renders \`<App />\`)
2. \`src/App.tsx\` — Root component
3. \`src/index.css\` — Tailwind v4 styles (template provides this)

### Entry Point Template
\`\`\`tsx
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
\`\`\`

### Import Paths
| From file               | Import components from    |
|------------------------|--------------------------|
| \`src/App.tsx\`           | \`./components/ui\`        |
| \`src/pages/Home.tsx\`    | \`../components/ui\`       |
| \`src/components/Nav.tsx\` | \`./ui\`                   |

Use relative paths. The \`@/\` alias is available but relative paths are more reliable.

### Key Differences from Next.js
- No Server Components — all components are client-side
- No \`'use client'\` directive needed
- Use React Router for routing (if needed)
- Use \`import.meta.env\` for environment variables
- No \`next/image\`, \`next/link\`, \`next-themes\` — use standard HTML/React or installed packages
- Vite's \`index.html\` is pre-configured to load \`/src/main.tsx\`

### React Router Setup (When Routing Needed)
\`\`\`tsx
// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import About from './pages/About'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </BrowserRouter>
  )
}
\`\`\`
</skill:vite>
`;
