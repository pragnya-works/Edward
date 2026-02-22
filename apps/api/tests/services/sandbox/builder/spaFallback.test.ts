import { describe, expect, it } from 'vitest';
import {
  generatePreviewRuntimeScript,
  getPreviewRuntimeScriptSrc,
  injectRuntimeScriptIntoHtml,
  PREVIEW_RUNTIME_FILENAME,
} from '../../../../services/sandbox/builder/spaFallback.js';

describe('spaFallback runtime bridge injection', () => {
  it('builds a stable runtime src for subdomain deployments', () => {
    const src = getPreviewRuntimeScriptSrc({
      basePath: '',
      assetPrefix: '',
    });

    expect(src).toBe(`/${PREVIEW_RUNTIME_FILENAME}`);
  });

  it('builds a stable runtime src for path deployments', () => {
    const src = getPreviewRuntimeScriptSrc({
      basePath: '/user-1/chat-1/preview/',
      assetPrefix: '/user-1/chat-1/preview/',
    });

    expect(src).toBe(`/user-1/chat-1/preview/${PREVIEW_RUNTIME_FILENAME}`);
  });

  it('injects an external bridge script tag instead of inline runtime script', () => {
    const html = '<html><head><title>Preview</title></head><body><h1>Hi</h1></body></html>';
    const result = injectRuntimeScriptIntoHtml(html, {
      basePath: '/u/c/preview',
      assetPrefix: '/u/c/preview/',
    });

    expect(result).toContain(
      `<script defer src="/u/c/preview/${PREVIEW_RUNTIME_FILENAME}"></script>`,
    );
    expect(result).not.toContain('window.__EDWARD_RUNTIME__');
  });

  it('generates a runtime payload with bridge ready + location events', () => {
    const runtimeScript = generatePreviewRuntimeScript({
      basePath: '/u/c/preview',
      assetPrefix: '/u/c/preview/',
    });

    expect(runtimeScript).toContain("type: readyEvent");
    expect(runtimeScript).toContain("type: locationEvent");
    expect(runtimeScript).toContain("data.type === 'navigate-back'");
  });
});
