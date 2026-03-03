export const PREVIEW_RUNTIME_SCRIPT_NAVIGATION = `
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

    if (event.source !== window.parent) {
      return;
    }

    if (expectedHostOrigin && event.origin !== expectedHostOrigin) {
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
