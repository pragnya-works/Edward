export const REACT_BEST_PRACTICES_SKILL = `
<skill:react-best-practices>
## React & Next.js Performance Optimization

Comprehensive performance rules for React and Next.js applications, prioritized by impact.
Apply these rules when generating, reviewing, or refactoring React/Next.js code.

---

### CATEGORY 1: Eliminating Waterfalls — CRITICAL

Waterfalls are the #1 performance killer. Each sequential await adds full network latency.

#### 1.1 Defer Await Until Needed
Move \`await\` into the branch that actually uses the data. Early-return paths should not block on unused fetches.

\`\`\`typescript
// BAD: blocks both branches
async function handleRequest(userId: string, skip: boolean) {
  const data = await fetchUserData(userId);
  if (skip) return { skipped: true };
  return processUserData(data);
}

// GOOD: only blocks when needed
async function handleRequest(userId: string, skip: boolean) {
  if (skip) return { skipped: true };
  const data = await fetchUserData(userId);
  return processUserData(data);
}
\`\`\`

#### 1.2 Promise.all() for Independent Operations
When async operations have no interdependencies, execute concurrently.

\`\`\`typescript
// BAD: sequential — 3 round trips
const user = await fetchUser();
const posts = await fetchPosts();
const comments = await fetchComments();

// GOOD: parallel — 1 round trip
const [user, posts, comments] = await Promise.all([
  fetchUser(), fetchPosts(), fetchComments()
]);
\`\`\`

#### 1.3 Dependency-Based Parallelization
For operations with partial dependencies, start independent work immediately.

\`\`\`typescript
// GOOD: config and profile run in parallel
const userPromise = fetchUser();
const profilePromise = userPromise.then(user => fetchProfile(user.id));
const [user, config, profile] = await Promise.all([
  userPromise, fetchConfig(), profilePromise
]);
\`\`\`

#### 1.4 Prevent Waterfall Chains in API Routes
In API routes and Server Actions, start independent operations immediately.

\`\`\`typescript
// GOOD: auth and config start immediately
export async function GET(request: Request) {
  const sessionPromise = auth();
  const configPromise = fetchConfig();
  const session = await sessionPromise;
  const [config, data] = await Promise.all([
    configPromise, fetchData(session.user.id)
  ]);
  return Response.json({ data, config });
}
\`\`\`

#### 1.5 Strategic Suspense Boundaries
Use Suspense to show wrapper UI immediately while data streams in.

\`\`\`tsx
// GOOD: layout renders immediately, data streams in
function Page() {
  return (
    <div>
      <Sidebar />
      <Header />
      <Suspense fallback={<Skeleton />}>
        <DataDisplay />
      </Suspense>
      <Footer />
    </div>
  );
}

async function DataDisplay() {
  const data = await fetchData(); // Only blocks this component
  return <div>{data.content}</div>;
}
\`\`\`

**When NOT to use**: Critical SEO content above the fold, layout-deciding data, small fast queries where suspense overhead isn't worth it.

---

### CATEGORY 2: Bundle Size Optimization — CRITICAL

Reducing initial bundle size directly improves TTI and LCP.

#### 2.1 Avoid Barrel File Imports
Import directly from source files. Barrel files can load 1000+ unused modules (200-800ms cost).

\`\`\`tsx
// BAD: imports entire library
import { Check, X, Menu } from 'lucide-react';

// GOOD: imports only what you need
import Check from 'lucide-react/dist/esm/icons/check';
import X from 'lucide-react/dist/esm/icons/x';
import Menu from 'lucide-react/dist/esm/icons/menu';

// ALTERNATIVE (Next.js 13.5+): use optimizePackageImports
// next.config.js
module.exports = {
  experimental: {
    optimizePackageImports: ['lucide-react', '@mui/material']
  }
};
\`\`\`

**Commonly affected**: lucide-react, @mui/material, @tabler/icons-react, react-icons, lodash, date-fns, rxjs.

#### 2.2 Dynamic Imports for Heavy Components
Use \`next/dynamic\` to lazy-load large components not needed on initial render.

\`\`\`tsx
// BAD: Monaco bundles with main chunk ~300KB
import { MonacoEditor } from './monaco-editor';

// GOOD: Monaco loads on demand
import dynamic from 'next/dynamic';
const MonacoEditor = dynamic(
  () => import('./monaco-editor').then(m => m.MonacoEditor),
  { ssr: false }
);
\`\`\`

#### 2.3 Defer Non-Critical Third-Party Libraries
Analytics, logging, error tracking don't block user interaction. Load after hydration.

\`\`\`tsx
// GOOD: loads after hydration
import dynamic from 'next/dynamic';
const Analytics = dynamic(
  () => import('@vercel/analytics/react').then(m => m.Analytics),
  { ssr: false }
);
\`\`\`

#### 2.4 Preload Based on User Intent
Preload heavy bundles on hover/focus to reduce perceived latency.

\`\`\`tsx
function EditorButton({ onClick }: { onClick: () => void }) {
  const preload = () => { void import('./monaco-editor'); };
  return (
    <button onMouseEnter={preload} onFocus={preload} onClick={onClick}>
      Open Editor
    </button>
  );
}
\`\`\`

---

### CATEGORY 3: Server-Side Performance — HIGH

#### 3.1 Authenticate Server Actions Like API Routes
Server Actions are public endpoints. Always verify auth inside each action.

\`\`\`typescript
'use server';
import { verifySession } from '@/lib/auth';

export async function deleteUser(userId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (session.user.role !== 'admin' && session.user.id !== userId) {
    throw new Error('Cannot delete other users');
  }
  await db.user.delete({ where: { id: userId } });
  return { success: true };
}
\`\`\`

#### 3.2 Minimize Serialization at RSC Boundaries
Only pass fields that the client actually uses across Server/Client boundaries.

\`\`\`tsx
// BAD: serializes all 50 fields
async function Page() {
  const user = await fetchUser();
  return <Profile user={user} />;
}

// GOOD: serializes only 1 field
async function Page() {
  const user = await fetchUser();
  return <Profile name={user.name} />;
}
\`\`\`

#### 3.3 Per-Request Deduplication with React.cache()
Use \`React.cache()\` for server-side request deduplication of DB queries, auth checks, and non-fetch async work.

\`\`\`typescript
import { cache } from 'react';

export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return await db.user.findUnique({ where: { id: session.user.id } });
});
\`\`\`

**Note**: \`React.cache()\` uses shallow equality (\`Object.is\`). Avoid inline objects as arguments.

#### 3.4 Cross-Request LRU Caching
For data shared across sequential requests, use an LRU cache (especially effective with Vercel Fluid Compute).

\`\`\`typescript
import { LRUCache } from 'lru-cache';
const cache = new LRUCache<string, any>({ max: 1000, ttl: 5 * 60 * 1000 });

export async function getUser(id: string) {
  const cached = cache.get(id);
  if (cached) return cached;
  const user = await db.user.findUnique({ where: { id } });
  cache.set(id, user);
  return user;
}
\`\`\`

#### 3.5 Parallel Data Fetching with Component Composition
Restructure RSC trees so sibling components fetch data in parallel, not sequentially.

\`\`\`tsx
// GOOD: both fetch simultaneously
async function Header() {
  const data = await fetchHeader();
  return <div>{data}</div>;
}
async function Sidebar() {
  const items = await fetchSidebarItems();
  return <nav>{items.map(renderItem)}</nav>;
}
export default function Page() {
  return <div><Header /><Sidebar /></div>;
}
\`\`\`

#### 3.6 Use after() for Non-Blocking Operations
Schedule logging/analytics after the response is sent.

\`\`\`tsx
import { after } from 'next/server';

export async function POST(request: Request) {
  await updateDatabase(request);
  after(async () => {
    const userAgent = (await headers()).get('user-agent') || 'unknown';
    logUserAction({ userAgent });
  });
  return Response.json({ status: 'success' });
}
\`\`\`

---

### CATEGORY 4: Client-Side Data Fetching — MEDIUM-HIGH

#### 4.1 Use SWR for Automatic Deduplication
Multiple component instances share one request automatically.

\`\`\`tsx
import useSWR from 'swr';
function UserList() {
  const { data: users } = useSWR('/api/users', fetcher);
}
\`\`\`

#### 4.2 Use Passive Event Listeners for Scrolling
Add \`{ passive: true }\` to touch and wheel events to enable immediate scrolling.

#### 4.3 Version and Minimize localStorage Data
Add version prefix, store only needed fields, always wrap in try-catch (throws in incognito).

---

### CATEGORY 5: Re-render Optimization — MEDIUM

#### 5.1 Calculate Derived State During Rendering
If a value can be computed from current props/state, do NOT store it in state or update via effect.

\`\`\`tsx
// BAD: redundant state + effect
const [fullName, setFullName] = useState('');
useEffect(() => setFullName(firstName + ' ' + lastName), [firstName, lastName]);

// GOOD: derive during render
const fullName = firstName + ' ' + lastName;
\`\`\`

#### 5.2 Use Functional setState Updates
Prevents stale closures and creates stable callback references.

\`\`\`tsx
// BAD: requires items as dependency, recreated every change
const addItems = useCallback((newItems) => {
  setItems([...items, ...newItems]);
}, [items]);

// GOOD: stable callback, never recreated
const addItems = useCallback((newItems) => {
  setItems(curr => [...curr, ...newItems]);
}, []);
\`\`\`

#### 5.3 Narrow Effect Dependencies
Specify primitive dependencies instead of objects.

\`\`\`tsx
// BAD: re-runs on any user field change
useEffect(() => { console.log(user.id); }, [user]);

// GOOD: re-runs only when id changes
useEffect(() => { console.log(user.id); }, [user.id]);
\`\`\`

#### 5.4 Use Lazy State Initialization
Pass a function to \`useState\` for expensive initial values.

\`\`\`tsx
// BAD: JSON.parse runs every render
const [settings, setSettings] = useState(JSON.parse(localStorage.getItem('settings') || '{}'));

// GOOD: runs only once
const [settings, setSettings] = useState(() => {
  const stored = localStorage.getItem('settings');
  return stored ? JSON.parse(stored) : {};
});
\`\`\`

#### 5.5 Use Transitions for Non-Urgent Updates
Mark frequent, non-urgent state updates as transitions with \`startTransition\`.

#### 5.6 Use useRef for Transient Values
Store frequently-changing values that don't need re-renders (mouse position, intervals) in refs.

#### 5.7 Defer State Reads to Usage Point
Don't subscribe to dynamic state (searchParams) if you only read it inside callbacks.

#### 5.8 Put Interaction Logic in Event Handlers
If a side effect is triggered by a specific user action, run it in the handler — not as state + effect.

---

### CATEGORY 6: Rendering Performance — MEDIUM

#### 6.1 CSS content-visibility for Long Lists
Apply \`content-visibility: auto\` to defer off-screen rendering.

\`\`\`css
.message-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 80px;
}
\`\`\`

#### 6.2 Hoist Static JSX Elements
Extract static JSX outside components to avoid re-creation.

\`\`\`tsx
// GOOD: reuses same element
const loadingSkeleton = <div className="animate-pulse h-20 bg-gray-200" />;
function Container() {
  return <div>{loading && loadingSkeleton}</div>;
}
\`\`\`

#### 6.3 Prevent Hydration Mismatch Without Flickering
For client-only data (localStorage theme), inject a synchronous script that updates DOM before React hydrates.

#### 6.4 Animate SVG Wrapper Instead of SVG Element
Wrap SVG in a \`<div>\` and animate the wrapper for hardware acceleration.

#### 6.5 Use Explicit Conditional Rendering
Use ternary (\`? :\`) instead of \`&&\` when condition can be \`0\`, \`NaN\`, or other falsy values that render.

\`\`\`tsx
// BAD: renders "0" when count is 0
{count && <Badge>{count}</Badge>}

// GOOD: renders nothing when count is 0
{count > 0 ? <Badge>{count}</Badge> : null}
\`\`\`

#### 6.6 Use useTransition Over Manual Loading States
\`useTransition\` provides built-in \`isPending\`, auto-resets on error, and cancels pending transitions.

---

### CATEGORY 7: JavaScript Performance — LOW-MEDIUM

#### Key Rules
- **Avoid Layout Thrashing**: Never interleave DOM style writes with layout reads. Batch writes, then read.
- **Build Index Maps**: Multiple \`.find()\` by same key → use a Map. O(n) → O(1) per lookup.
- **Combine Array Iterations**: Multiple \`.filter()\`/\`.map()\` → single \`for...of\` loop.
- **Early Return**: Return immediately when result is determined. Skip unnecessary processing.
- **Use Set/Map for Lookups**: Convert arrays to Set for \`.has()\` checks. O(n) → O(1).
- **Use toSorted()**: Prefer \`.toSorted()\` over \`.sort()\` to avoid mutating React state/props.
- **Hoist RegExp**: Don't create RegExp inside render. Hoist to module scope or \`useMemo\`.
- **Cache Storage API Calls**: localStorage/sessionStorage are synchronous and expensive. Cache reads in memory.

---

### CATEGORY 8: Advanced Patterns — LOW

#### 8.1 Initialize App Once, Not Per Mount
Use a module-level guard for app-wide init that must run once.

\`\`\`tsx
let didInit = false;
function Comp() {
  useEffect(() => {
    if (didInit) return;
    didInit = true;
    loadFromStorage();
    checkAuthToken();
  }, []);
}
\`\`\`

#### 8.2 Store Event Handlers in Refs
Use \`useEffectEvent\` for stable callback refs that don't cause effect re-subscriptions.

\`\`\`tsx
import { useEffectEvent } from 'react';

function useWindowEvent(event: string, handler: (e: Event) => void) {
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    window.addEventListener(event, onEvent);
    return () => window.removeEventListener(event, onEvent);
  }, [event]);
}
\`\`\`

---

### QUICK REFERENCE: Priority Checklist

When generating or reviewing React/Next.js code, check in this order:

1. **CRITICAL**: Are there sequential awaits that could be parallelized? (Promise.all, Suspense)
2. **CRITICAL**: Are barrel imports used where direct imports would reduce bundle? (lucide-react, MUI, lodash)
3. **CRITICAL**: Are heavy components bundled eagerly? (use next/dynamic, ssr: false)
4. **HIGH**: Are Server Actions authenticated inside the action body?
5. **HIGH**: Are RSC props passing more data than the client needs?
6. **MEDIUM**: Is derived state stored in useState + useEffect instead of computed inline?
7. **MEDIUM**: Are setState calls using direct state reference instead of functional updates?
8. **MEDIUM**: Are long lists rendered without content-visibility or virtualization?

</skill:react-best-practices>
`;
