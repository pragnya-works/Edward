const RESERVED = new Set([
    "www",
    "api",
    "admin",
    "app",
    "mail",
    "dashboard",
    "ftp",
    "dev",
    "smtp",
    "staging",
]);

const DEFAULT_FRAME_ANCESTORS = [
    "'self'",
    "http://localhost:3000",
    "https://edwardd.app",
    "https://www.edwardd.app",
].join(" ");

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
    const key = `rl:${subdomain}:${Math.floor(Date.now() / 60000)}`;
    try {
        const count = parseInt((await env.SUBDOMAIN_MAPPINGS.get(key)) || "0", 10);
        if (count >= 500) return true;
        await env.SUBDOMAIN_MAPPINGS.put(key, String(count + 1), { expirationTtl: 120 });
        return false;
    } catch {
        return false;
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

        if (!subdomain || RESERVED.has(subdomain)) {
            return new Response("Welcome to Edwardd", { status: 200 });
        }

        if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("Method Not Allowed", { status: 405 });
        }

        if (await isRateLimited(subdomain, env)) {
            return new Response("Too Many Requests", {
                status: 429,
                headers: { "Retry-After": "60" },
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

        const headers = new Headers();
        headers.set(
            "Content-Type",
            response.headers.get("content-type") || "application/octet-stream"
        );
        headers.set(
            "Cache-Control",
            isAsset
                ? "public, max-age=31536000, immutable"
                : "public, max-age=60, must-revalidate",
        );
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
    return new Response(
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>App Not Found — Edwardd</title>
  <style>
    body { font-family: system-ui, sans-serif; text-align: center; padding: 60px; background: #f9fafb; }
    h1 { color: #111; }
    p { color: #666; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>App not found</h1>
  <p><code>${subdomain}.edwardd.app</code> doesn't exist or hasn't been deployed yet.</p>
</body>
</html>`,
        { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
}
