import { RuntimeConfig } from "../basePathInjector.js";
import { renderPreviewRuntimeScript } from "./runtimeScriptTemplate.js";

export const PREVIEW_BRIDGE_SOURCE = '__edward_preview_bridge__';
export const PREVIEW_HOST_SOURCE = '__edward_preview_host__';
export const PREVIEW_LOCATION_UPDATE_EVENT = 'location-update';
export const PREVIEW_READY_EVENT = 'preview-ready';
export const PREVIEW_RUNTIME_FILENAME = '__edward_preview_bridge.js';

function normalizeBasePath(basePath: string | undefined): string {
  if (!basePath) {
    return '';
  }

  if (basePath === '/') {
    return '';
  }

  return basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
}

export function getPreviewRuntimeScriptSrc(runtimeConfig: RuntimeConfig): string {
  const basePath = normalizeBasePath(runtimeConfig.basePath);
  return `${basePath}/${PREVIEW_RUNTIME_FILENAME}`;
}

export function generateSpaFallbackHtml(_runtimeConfig: RuntimeConfig): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="edward-preview-fallback" content="1">
  <title>Redirecting...</title>
</head>
<body>
  <p>Redirecting...</p>
</body>
</html>`;
}

export function generatePreviewRuntimeScript(runtimeConfig: RuntimeConfig): string {
  const basePath = normalizeBasePath(runtimeConfig.basePath);
  return renderPreviewRuntimeScript({
    basePath,
    assetPrefix: runtimeConfig.assetPrefix,
    bridgeSource: PREVIEW_BRIDGE_SOURCE,
    hostSource: PREVIEW_HOST_SOURCE,
    locationEvent: PREVIEW_LOCATION_UPDATE_EVENT,
    readyEvent: PREVIEW_READY_EVENT,
  });
}

export function injectRuntimeScriptIntoHtml(html: string, runtimeConfig: RuntimeConfig): string {
  const scriptSrc = getPreviewRuntimeScriptSrc(runtimeConfig);
  const scriptTag = `<script defer src="${scriptSrc}"></script>`;

  if (html.includes(scriptSrc)) {
    return html;
  }

  if (html.includes('</head>')) {
    return html.replace('</head>', `${scriptTag}\n</head>`);
  }

  if (html.includes('<body')) {
    return html.replace(/<body([^>]*)>/, `<body$1>\n${scriptTag}`);
  }

  return scriptTag + html;
}
