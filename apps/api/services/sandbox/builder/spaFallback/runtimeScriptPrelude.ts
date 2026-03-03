interface RenderPreviewRuntimeScriptPreludeParams {
  basePath: string;
  assetPrefix: string | undefined;
  bridgeSource: string;
  hostSource: string;
  locationEvent: string;
  readyEvent: string;
}

export function renderPreviewRuntimeScriptPrelude(
  params: RenderPreviewRuntimeScriptPreludeParams,
): string {
  const runtimeConfig = {
    basePath: params.basePath,
    assetPrefix: params.assetPrefix,
  };

  return `
window.__EDWARD_RUNTIME__ = ${JSON.stringify(runtimeConfig)};
(function() {
  var basePath = ${JSON.stringify(params.basePath)};
  var intendedRouteKey = '__edward_intended_route';
  var bridgeSource = ${JSON.stringify(params.bridgeSource)};
  var hostSource = ${JSON.stringify(params.hostSource)};
  var locationEvent = ${JSON.stringify(params.locationEvent)};
  var readyEvent = ${JSON.stringify(params.readyEvent)};
  var expectedHostOrigin = '';
  var historyStackKey = '__edward_preview_history_stack';
  var historyIndexKey = '__edward_preview_history_index';
  var maxHistoryEntries = 120;

  try {
    if (document && typeof document.referrer === 'string' && document.referrer) {
      expectedHostOrigin = new URL(document.referrer).origin;
    }
  } catch (_) {
    expectedHostOrigin = '';
  }

  function safeSessionStorageGet(key) {
    try {
      return window.sessionStorage ? window.sessionStorage.getItem(key) : null;
    } catch (_) {
      return null;
    }
  }

  function safeSessionStorageSet(key, value) {
    try {
      if (window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
      }
    } catch (_) {
      // Ignore storage write failures.
    }
  }

  function safeSessionStorageRemove(key) {
    try {
      if (window.sessionStorage) {
        window.sessionStorage.removeItem(key);
      }
    } catch (_) {
      // Ignore storage delete failures.
    }
  }

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
    safeSessionStorageSet(intendedRouteKey, intendedRoute + search + hash);
    window.location.replace(basePath + '/' + search + hash);
    return;
  }

  var intendedRoute = safeSessionStorageGet(intendedRouteKey);
  if (intendedRoute) {
    safeSessionStorageRemove(intendedRouteKey);
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
      var rawStack = safeSessionStorageGet(historyStackKey);
      var parsedStack = rawStack ? JSON.parse(rawStack) : [];
      if (Array.isArray(parsedStack)) {
        stack = parsedStack.filter(function(entry) {
          return typeof entry === 'string' && entry.length > 0;
        });
      }
      index = parseStoredIndex(safeSessionStorageGet(historyIndexKey));
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
    safeSessionStorageSet(historyStackKey, JSON.stringify(historyStack));
    safeSessionStorageSet(historyIndexKey, String(historyIndex));
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
`;
}
