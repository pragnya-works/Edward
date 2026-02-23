import type { RuntimeConfig } from "./basePathInjector.js";
import {
  generatePreviewRuntimeScript as generatePreviewRuntimeScriptInternal,
  generateSpaFallbackHtml as generateSpaFallbackHtmlInternal,
  getPreviewRuntimeScriptSrc as getPreviewRuntimeScriptSrcInternal,
  injectRuntimeScriptIntoHtml as injectRuntimeScriptIntoHtmlInternal,
} from "./spaFallback/orchestrator.js";

export const PREVIEW_BRIDGE_SOURCE = "__edward_preview_bridge__";
export const PREVIEW_HOST_SOURCE = "__edward_preview_host__";
export const PREVIEW_LOCATION_UPDATE_EVENT = "location-update";
export const PREVIEW_READY_EVENT = "preview-ready";
export const PREVIEW_RUNTIME_FILENAME = "__edward_preview_bridge.js";

export function getPreviewRuntimeScriptSrc(runtimeConfig: RuntimeConfig): string {
  return getPreviewRuntimeScriptSrcInternal(runtimeConfig);
}

export function generateSpaFallbackHtml(runtimeConfig: RuntimeConfig): string {
  return generateSpaFallbackHtmlInternal(runtimeConfig);
}

export function generatePreviewRuntimeScript(runtimeConfig: RuntimeConfig): string {
  return generatePreviewRuntimeScriptInternal(runtimeConfig);
}

export function injectRuntimeScriptIntoHtml(
  html: string,
  runtimeConfig: RuntimeConfig,
): string {
  return injectRuntimeScriptIntoHtmlInternal(html, runtimeConfig);
}
