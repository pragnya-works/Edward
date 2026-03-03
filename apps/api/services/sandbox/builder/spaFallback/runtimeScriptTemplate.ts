import { PREVIEW_RUNTIME_SCRIPT_NAVIGATION } from "./runtimeScriptNavigation.js";
import { renderPreviewRuntimeScriptPrelude } from "./runtimeScriptPrelude.js";

interface RenderPreviewRuntimeScriptParams {
  basePath: string;
  assetPrefix: string | undefined;
  bridgeSource: string;
  hostSource: string;
  locationEvent: string;
  readyEvent: string;
}

export function renderPreviewRuntimeScript(
  params: RenderPreviewRuntimeScriptParams,
): string {
  return `${renderPreviewRuntimeScriptPrelude(params)}${PREVIEW_RUNTIME_SCRIPT_NAVIGATION}`;
}
