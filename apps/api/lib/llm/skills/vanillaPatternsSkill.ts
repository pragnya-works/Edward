export const VANILLA_PATTERNS_SKILL = `
<skill:vanilla>
## Vanilla HTML/CSS/JS Patterns

### File Structure
Use \`base="web"\` in sandbox. Files go at root level.
\`\`\`
index.html    — Main HTML with <link> to styles.css and <script> to script.js
styles.css    — All styles
script.js     — All JavaScript
\`\`\`

### HTML Template
\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Title</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main id="app"></main>
  <script src="script.js"></script>
</body>
</html>
\`\`\`

### CSS Patterns
Use CSS variables, Grid, Flexbox, and modern features:
\`\`\`css
*, *::before, *::after { box-sizing: border-box; margin: 0; }

:root {
  --bg: #0a0a0a; --surface: #141414; --border: rgba(255,255,255,0.06);
  --text: #fafafa; --muted: #888; --accent: #3b82f6;
  --radius: 12px; --font: 'DM Sans', system-ui, sans-serif;
}

body {
  font-family: var(--font); background: var(--bg); color: var(--text);
  line-height: 1.6; -webkit-font-smoothing: antialiased;
}
\`\`\`

### JavaScript Patterns
Use ES6+ features. DOM manipulation via \`querySelector\`. No external CDNs unless requested.
\`\`\`js
document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  // Build UI programmatically or manipulate existing DOM
});
\`\`\`

### Responsive Design
Use \`clamp()\`, \`min()\`, and media queries:
\`\`\`css
.container { width: min(90%, 1200px); margin: 0 auto; padding: 2rem; }
h1 { font-size: clamp(2rem, 5vw, 4rem); }
@media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
\`\`\`
</skill:vanilla>
`;
