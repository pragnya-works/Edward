const RESERVED = new Set([
    "www",
    "api",
    "backend",
    "admin",
    "app",
    "mail",
    "dashboard",
    "ftp",
    "dev",
    "smtp",
    "staging",
    "preview",
    "static",
    "assets",
    "cdn",
    "media",
    "files",
    "storage",
]);

const DEFAULT_FRAME_ANCESTORS = [
    "'self'",
    "http://localhost:3000",
    "https://edwardd.app",
    "https://www.edwardd.app",
].join(" ");

const RATE_LIMIT_MAX_REQUESTS_PER_MINUTE = 500;
const FAVICON_ICO_URL = "https://assets.pragnyaa.in/home/favicon_io/favicon.ico";
const FAVICON_16_URL = "https://assets.pragnyaa.in/home/favicon_io/favicon-16x16.png";
const FAVICON_32_URL = "https://assets.pragnyaa.in/home/favicon_io/favicon-32x32.png";
const EDWARD_LOGO_URL = "https://assets.pragnyaa.in/home/favicon_io/apple-touch-icon.png";
const WEB_MANIFEST_URL = "https://assets.pragnyaa.in/home/favicon_io/site.webmanifest";

function getCurrentMinuteWindow() {
    return Math.floor(Date.now() / 60000);
}

function getRetryAfterSeconds() {
    const remainder = 60000 - (Date.now() % 60000);
    return Math.max(1, Math.ceil(remainder / 1000));
}

function resolveFrameAncestors(env) {
    const configured = typeof env.FRAME_ANCESTORS === "string" ? env.FRAME_ANCESTORS.trim() : "";
    return configured || DEFAULT_FRAME_ANCESTORS;
}

function upsertFrameAncestors(csp, frameAncestors) {
    const directive = `frame-ancestors ${frameAncestors}`;
    if (!csp) return directive;
    if (/frame-ancestors\s+[^;]+/i.test(csp)) {
        return csp.replace(/frame-ancestors\s+[^;]+/i, directive);
    }
    return `${csp}; ${directive}`;
}

async function isRateLimited(subdomain, env) {
    if (!env.RATE_LIMITER || typeof env.RATE_LIMITER.idFromName !== "function") {
        return false;
    }

    try {
        const id = env.RATE_LIMITER.idFromName(subdomain);
        const stub = env.RATE_LIMITER.get(id);
        const response = await stub.fetch("https://rate-limiter.internal/check", {
            method: "POST",
        });

        if (!response.ok) {
            return false;
        }

        const payload = await response.json();
        return payload?.rateLimited === true;
    } catch {
        return false;
    }
}

export class RateLimiter {
    constructor(state) {
        this.state = state;
        this.currentWindow = getCurrentMinuteWindow();
        this.count = 0;
        this.initialized = this.state.blockConcurrencyWhile(async () => {
            const savedState = await this.state.storage.get("rate-state");
            if (
                savedState &&
                typeof savedState === "object" &&
                typeof savedState.window === "number" &&
                typeof savedState.count === "number"
            ) {
                this.currentWindow = savedState.window;
                this.count = savedState.count;
            }
        });
    }

    async fetch(request) {
        if (request.method !== "POST") {
            return new Response("Method Not Allowed", { status: 405 });
        }

        await this.initialized;

        const nowWindow = getCurrentMinuteWindow();
        if (nowWindow !== this.currentWindow) {
            this.currentWindow = nowWindow;
            this.count = 0;
        }

        if (this.count >= RATE_LIMIT_MAX_REQUESTS_PER_MINUTE) {
            return Response.json({
                rateLimited: true,
                retryAfterSeconds: getRetryAfterSeconds(),
            });
        }

        this.count += 1;
        await this.state.storage.put("rate-state", {
            window: this.currentWindow,
            count: this.count,
        });

        return Response.json({ rateLimited: false });
    }
}

function isSafePath(pathname) {
    const hasUnsafePattern = (value) => (
        value.includes("\0") ||
        value.includes("\\") ||
        /(?:^|\/)\.\.(?:\/|$)/.test(value) ||
        /\/\//.test(value) ||
        /[\u0000-\u001F\u007F]/.test(value)
    );

    if (hasUnsafePattern(pathname)) {
        return false;
    }

    try {
        const decodedPath = decodeURIComponent(pathname);
        if (hasUnsafePattern(decodedPath)) {
            return false;
        }
    } catch {
        return false;
    }

    return true;
}

export default {
    async fetch(request, env) {
        const cloudfrontBase = typeof env.CLOUDFRONT_URL === "string"
            ? env.CLOUDFRONT_URL.trim().replace(/\/$/, "")
            : "";
        if (!cloudfrontBase) {
            return new Response("Worker misconfigured", { status: 500 });
        }

        const frameAncestors = resolveFrameAncestors(env);
        const url = new URL(request.url);
        const [subdomain] = url.hostname.split(".");

        if (!subdomain) {
            return new Response("Welcome to Edwardd", { status: 200 });
        }

        // Reserved product subdomains should bypass preview routing entirely.
        if (RESERVED.has(subdomain)) {
            return fetch(request);
        }

        if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("Method Not Allowed", { status: 405 });
        }

        if (await isRateLimited(subdomain, env)) {
            return new Response("Too Many Requests", {
                status: 429,
                headers: { "Retry-After": String(getRetryAfterSeconds()) },
            });
        }

        const s3Path = await env.SUBDOMAIN_MAPPINGS.get(subdomain);
        if (!s3Path) return notFound(subdomain);

        const cleanPath = s3Path.replace(/^\/|\/$/g, "");
        const pathname = url.pathname;

        if (!isSafePath(pathname)) {
            return new Response("Bad Request", { status: 400 });
        }

        const hasExtension = /\.[a-zA-Z0-9]+$/.test(pathname);
        const isAsset = hasExtension && pathname !== "/";

        const cfPath = isAsset
            ? `/${cleanPath}/preview${pathname}`
            : `/${cleanPath}/preview/index.html`;

        const cfUrl = `${cloudfrontBase}${cfPath}`;

        const response = await fetch(cfUrl, {
            method: request.method,
            headers: {
                "Accept-Encoding": request.headers.get("Accept-Encoding") || "gzip, br",
                "User-Agent": "Mozilla/5.0 (compatible; Edwardd-Router/1.0)",
            },
        });

        if (!response.ok && !isAsset && (response.status === 403 || response.status === 404)) {
            return notFound(subdomain);
        }

        const headers = new Headers();
        headers.set(
            "Content-Type",
            response.headers.get("content-type") || "application/octet-stream"
        );
        const cacheControl = isAsset
            ? (response.ok
                ? "public, max-age=31536000, immutable"
                : "no-store")
            : "public, max-age=60, must-revalidate";
        headers.set("Cache-Control", cacheControl);
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

        const contentType = response.headers.get("content-type") || "";
        if (contentType.toLowerCase().includes("text/html")) {
            const upstreamCsp = response.headers.get("content-security-policy");
            headers.set(
                "Content-Security-Policy",
                upsertFrameAncestors(upstreamCsp, frameAncestors),
            );
        }

        const contentLength = response.headers.get("content-length");
        if (contentLength) headers.set("Content-Length", contentLength);

        return new Response(response.body, { status: response.status, headers });
    },
};

function notFound(subdomain) {
    const domain = `${subdomain}.edwardd.app`;
    const escapedDomain = escapeHtml(domain);

    return new Response(
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>App Not Found - Edward</title>
  <link rel="preconnect" href="https://assets.pragnyaa.in" crossorigin>
  <link rel="icon" href="${FAVICON_ICO_URL}">
  <link rel="icon" type="image/png" sizes="16x16" href="${FAVICON_16_URL}">
  <link rel="icon" type="image/png" sizes="32x32" href="${FAVICON_32_URL}">
  <link rel="apple-touch-icon" href="${EDWARD_LOGO_URL}">
  <link rel="manifest" href="${WEB_MANIFEST_URL}">
  <style>
    :root {
      --bg: #f4f6f9;
      --surface: rgba(255, 255, 255, 0.96);
      --text: #141923;
      --muted: #4c5568;
      --line: rgba(20, 25, 35, 0.1);
      --accent: #2563eb;
      --shadow: 0 6px 20px rgba(15, 23, 42, 0.08);
      --glow: radial-gradient(55% 50% at 50% 0%, rgba(37, 99, 235, 0.17), rgba(37, 99, 235, 0));
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: clamp(16px, 4vw, 28px);
      font-family: "Avenir Next", "Segoe UI Variable", "SF Pro Display", "Segoe UI", sans-serif;
      background:
        radial-gradient(1000px 480px at 50% -20%, rgba(148, 163, 184, 0.24) 0%, transparent 60%),
        linear-gradient(180deg, #f8fafd 0%, var(--bg) 100%);
      color: var(--text);
    }
    .frame {
      position: relative;
      width: min(100%, 560px);
    }
    .frame::before {
      content: "";
      position: absolute;
      inset: -40px -48px;
      background: var(--glow);
      filter: blur(14px);
      z-index: 0;
      opacity: 0.35;
      pointer-events: none;
    }
    .card {
      position: relative;
      z-index: 1;
      border-radius: 24px;
      border: 1px solid var(--line);
      background: var(--surface);
      box-shadow: var(--shadow);
      padding: clamp(22px, 4vw, 30px) clamp(16px, 4vw, 28px) clamp(18px, 3vw, 24px);
      text-align: center;
      opacity: 0;
      transform: translateY(10px) scale(0.985);
      animation: rise 300ms ease-out 40ms forwards;
    }
    .logo {
      display: block;
      margin: 0 auto;
      width: clamp(50px, 7vw, 56px);
      height: clamp(50px, 7vw, 56px);
      border-radius: 14px;
      border: 1px solid rgba(20, 25, 35, 0.08);
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
      object-fit: cover;
    }
    h1 {
      margin: 16px 0 8px;
      font-size: clamp(1.4rem, 2vw, 1.7rem);
      line-height: 1.22;
      letter-spacing: -0.02em;
      font-weight: 700;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.62;
      font-size: clamp(0.92rem, 2.7vw, 0.96rem);
    }
    .domain {
      margin-top: 12px;
    }
    .domain span {
      display: inline-block;
      max-width: 100%;
      border-radius: 999px;
      border: 1px solid rgba(20, 25, 35, 0.14);
      background: rgba(255, 255, 255, 0.92);
      color: #2a3342;
      padding: 6px 12px;
      font-size: 0.84rem;
      letter-spacing: 0.01em;
      font-family: "SF Mono", "Menlo", "Consolas", monospace;
      overflow-wrap: anywhere;
    }
    .hint {
      margin-top: 16px;
      font-size: 0.89rem;
    }
    .hint a {
      color: var(--accent);
      text-underline-offset: 0.15em;
      text-decoration-thickness: 1.5px;
      text-decoration-color: rgba(37, 99, 235, 0.35);
      font-weight: 500;
    }
    .hint a:hover {
      text-decoration-color: rgba(37, 99, 235, 0.75);
    }
    @media (max-width: 560px) {
      .card {
        border-radius: 22px;
      }
      .domain span {
        border-radius: 12px;
      }
      h1 { font-size: 1.3rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      .frame::before,
      .card {
        animation: none !important;
      }
      .card {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(10px) scale(0.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
  </style>
</head>
<body>
  <main class="frame">
    <section class="card" role="status" aria-live="polite">
      <img
        class="logo"
        src="${EDWARD_LOGO_URL}"
        alt="Edward logo"
        width="56"
        height="56"
        loading="eager"
        decoding="async"
        fetchpriority="high"
      />
      <h1>App not found</h1>
      <p>This preview is currently unavailable.</p>
      <p class="domain"><span>${escapedDomain}</span></p>
      <p class="hint"><a href="https://edwardd.app" rel="noopener noreferrer">Build again in Edward</a> to restore this preview.</p>
    </section>
  </main>
</body>
</html>`,
        {
            status: 404,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
            },
        }
    );
}

function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
