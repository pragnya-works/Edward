import { RuntimeConfig } from './basePathInjector.js';

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
  const config = {
    basePath,
    assetPrefix: runtimeConfig.assetPrefix
  };

  return `
window.__EDWARD_RUNTIME__ = ${JSON.stringify(config)};
(function() {
  var basePath = '${basePath}';
  var intendedRouteKey = '__edward_intended_route';
  var bridgeSource = '${PREVIEW_BRIDGE_SOURCE}';
  var hostSource = '${PREVIEW_HOST_SOURCE}';
  var locationEvent = '${PREVIEW_LOCATION_UPDATE_EVENT}';
  var readyEvent = '${PREVIEW_READY_EVENT}';
  var historyStackKey = '__edward_preview_history_stack';
  var historyIndexKey = '__edward_preview_history_index';
  var maxHistoryEntries = 120;

  if (
    typeof document !== 'undefined' &&
    document.querySelector('meta[name="edward-preview-fallback"][content="1"]')
  ) {
    var currentPath = window.location.pathname;
    var search = window.location.search;
    var hash = window.location.hash;
    var intendedRoute = currentPath;
    if (basePath && intendedRoute.startsWith(basePath)) {
      intendedRoute = intendedRoute.slice(basePath.length);
    }
    if (!intendedRoute) intendedRoute = '/';
    sessionStorage.setItem(intendedRouteKey, intendedRoute + search + hash);
    window.location.replace(basePath + '/' + search + hash);
    return;
  }

  var intendedRoute = sessionStorage.getItem(intendedRouteKey);
  if (intendedRoute) {
    sessionStorage.removeItem(intendedRouteKey);
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', basePath + intendedRoute);
    }
  }

  function parseStoredIndex(value) {
    var parsed = Number.parseInt(value || '', 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function loadHistory(currentHref) {
    var stack = [];
    var index = 0;

    try {
      var rawStack = sessionStorage.getItem(historyStackKey);
      var parsedStack = rawStack ? JSON.parse(rawStack) : [];
      if (Array.isArray(parsedStack)) {
        stack = parsedStack.filter(function(entry) {
          return typeof entry === 'string' && entry.length > 0;
        });
      }
      index = parseStoredIndex(sessionStorage.getItem(historyIndexKey));
    } catch (_) {
      stack = [];
      index = 0;
    }

    if (stack.length === 0) {
      return {
        stack: [currentHref],
        index: 0,
      };
    }

    if (index < 0 || index >= stack.length) {
      index = stack.length - 1;
    }

    if (stack[index] === currentHref) {
      return {
        stack: stack,
        index: index,
      };
    }

    var existingIndex = stack.lastIndexOf(currentHref);
    if (existingIndex >= 0) {
      return {
        stack: stack,
        index: existingIndex,
      };
    }

    var nextStack = stack.slice(0, index + 1);
    nextStack.push(currentHref);
    if (nextStack.length > maxHistoryEntries) {
      nextStack = nextStack.slice(nextStack.length - maxHistoryEntries);
    }

    return {
      stack: nextStack,
      index: nextStack.length - 1,
    };
  }

  var initialHistory = loadHistory(window.location.href);
  var historyStack = initialHistory.stack;
  var historyIndex = initialHistory.index;
  var originalPushState =
    typeof window.history.pushState === 'function'
      ? window.history.pushState.bind(window.history)
      : null;
  var originalReplaceState =
    typeof window.history.replaceState === 'function'
      ? window.history.replaceState.bind(window.history)
      : null;
  var lastObservedHref = window.location.href;

  function persistHistory() {
    try {
      sessionStorage.setItem(historyStackKey, JSON.stringify(historyStack));
      sessionStorage.setItem(historyIndexKey, String(historyIndex));
    } catch (_) {
      // Ignore persistence failures.
    }
  }

  function trimHistoryIfNeeded() {
    if (historyStack.length <= maxHistoryEntries) {
      return;
    }

    var trimCount = historyStack.length - maxHistoryEntries;
    historyStack = historyStack.slice(trimCount);
    historyIndex = Math.max(0, historyIndex - trimCount);
  }

  function postLocation(reason) {
    if (!window.parent || window.parent === window) {
      return;
    }

    try {
      window.parent.postMessage(
        {
          source: bridgeSource,
          type: locationEvent,
          reason: reason || 'update',
          href: window.location.href,
          canGoBack: historyIndex > 0,
          canGoForward: historyIndex < historyStack.length - 1,
        },
        '*',
      );
    } catch (_) {
      // Ignore cross-origin messaging failures.
    }
  }

  function postBridgeReady() {
    if (!window.parent || window.parent === window) {
      return;
    }

    try {
      window.parent.postMessage(
        {
          source: bridgeSource,
          type: readyEvent,
          href: window.location.href,
          canGoBack: historyIndex > 0,
          canGoForward: historyIndex < historyStack.length - 1,
        },
        '*',
      );
    } catch (_) {
      // Ignore cross-origin messaging failures.
    }
  }

  function findHistoryIndexByHref(targetHref) {
    for (var i = historyStack.length - 1; i >= 0; i -= 1) {
      if (historyStack[i] === targetHref) {
        return i;
      }
    }
    return -1;
  }

  function dispatchSyntheticPopstate() {
    try {
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    } catch (_) {
      // Fall through to generic event.
    }

    try {
      window.dispatchEvent(new Event('popstate'));
    } catch (_) {
      // Ignore event dispatch failures.
    }
  }

  function applyUrlWithoutHistoryEntry(targetHref) {
    if (originalReplaceState) {
      try {
        originalReplaceState(window.history.state, '', targetHref);
        return true;
      } catch (_) {
        return false;
      }
    }

    return false;
  }

  function pushCurrentUrl(reason) {
    var currentHref = window.location.href;
    lastObservedHref = currentHref;

    if (historyStack[historyIndex] === currentHref) {
      persistHistory();
      postLocation(reason);
      return;
    }

    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push(currentHref);
    historyIndex = historyStack.length - 1;
    trimHistoryIfNeeded();
    persistHistory();
    postLocation(reason);
  }

  function replaceCurrentUrl(reason) {
    lastObservedHref = window.location.href;

    if (historyStack.length === 0) {
      historyStack = [window.location.href];
      historyIndex = 0;
    } else {
      historyStack[historyIndex] = window.location.href;
    }

    persistHistory();
    postLocation(reason);
  }

  function syncCurrentUrl(reason) {
    var currentHref = window.location.href;
    lastObservedHref = currentHref;

    if (historyStack[historyIndex] === currentHref) {
      persistHistory();
      postLocation(reason);
      return;
    }

    var existingIndex = findHistoryIndexByHref(currentHref);
    if (existingIndex >= 0) {
      historyIndex = existingIndex;
      persistHistory();
      postLocation(reason);
      return;
    }

    pushCurrentUrl(reason);
  }

  function navigateByStackDelta(delta, reason) {
    var targetIndex = historyIndex + delta;
    if (targetIndex < 0 || targetIndex >= historyStack.length) {
      postLocation(reason + '-noop');
      return;
    }

    historyIndex = targetIndex;
    persistHistory();

    var targetHref = historyStack[historyIndex];
    if (applyUrlWithoutHistoryEntry(targetHref)) {
      dispatchSyntheticPopstate();
      postLocation(reason);
      window.setTimeout(function() {
        syncCurrentUrl(reason + '-settled');
      }, 0);
      return;
    }

    try {
      window.location.replace(targetHref);
    } catch (_) {
      window.location.href = targetHref;
    }
  }

  function installHistoryOverrides() {
    var pushStateOverride = function(state, title, url) {
      var applied = false;

      if (originalReplaceState) {
        try {
          originalReplaceState(state, title, url);
          applied = true;
        } catch (_) {
          applied = false;
        }
      }

      if (!applied && originalPushState) {
        originalPushState(state, title, url);
      }

      pushCurrentUrl('pushState');
    };

    var replaceStateOverride = function(state, title, url) {
      if (originalReplaceState) {
        originalReplaceState(state, title, url);
      } else if (originalPushState) {
        originalPushState(state, title, url);
      }

      replaceCurrentUrl('replaceState');
    };

    try {
      window.history.pushState = pushStateOverride;
      window.history.replaceState = replaceStateOverride;
    } catch (_) {
      // Ignore non-writable history method failures.
    }

    try {
      if (window.History && window.History.prototype) {
        window.History.prototype.pushState = pushStateOverride;
        window.History.prototype.replaceState = replaceStateOverride;
      }
    } catch (_) {
      // Ignore prototype override failures.
    }
  }

  installHistoryOverrides();

  window.addEventListener('popstate', function() {
    syncCurrentUrl('popstate');
  });

  window.addEventListener('hashchange', function() {
    syncCurrentUrl('hashchange');
  });

  window.addEventListener('message', function(event) {
    var data = event && event.data;
    if (!data || typeof data !== 'object') {
      return;
    }

    if (data.source !== hostSource || typeof data.type !== 'string') {
      return;
    }

    if (data.type === 'navigate-back') {
      navigateByStackDelta(-1, 'host-back');
      return;
    }

    if (data.type === 'navigate-forward') {
      navigateByStackDelta(1, 'host-forward');
      return;
    }

    if (data.type === 'reload') {
      window.location.reload();
    }
  });

  postBridgeReady();
  persistHistory();
  postLocation('init');
  window.setInterval(function() {
    if (window.location.href !== lastObservedHref) {
      syncCurrentUrl('poll');
    }
    installHistoryOverrides();
  }, 150);

  window.setTimeout(function() {
    syncCurrentUrl('settled');
  }, 0);
})();
`;
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
