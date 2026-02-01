import { RuntimeConfig } from './base-path.injector.js';

export function generateSpaFallbackHtml(runtimeConfig: RuntimeConfig): string {
  const basePath = runtimeConfig.basePath || '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
  <script>
    (function() {
      var basePath = '${basePath}';
      var currentPath = window.location.pathname;
      var search = window.location.search;
      var hash = window.location.hash;
      var intendedRoute = currentPath;
      if (basePath && intendedRoute.startsWith(basePath)) {
        intendedRoute = intendedRoute.slice(basePath.length);
      }
      if (!intendedRoute) intendedRoute = '/';
      sessionStorage.setItem('__edward_intended_route', intendedRoute + search + hash);
      window.location.replace(basePath + '/' + search + hash);
    })();
  </script>
</head>
<body>
  <p>Redirecting...</p>
</body>
</html>`;
}

export function generateRuntimeScript(runtimeConfig: RuntimeConfig): string {
  const config = {
    basePath: runtimeConfig.basePath,
    assetPrefix: runtimeConfig.assetPrefix
  };

  return `<script>
window.__EDWARD_RUNTIME__ = ${JSON.stringify(config)};
(function() {
  var basePath = '${runtimeConfig.basePath || ''}';
  var intendedRoute = sessionStorage.getItem('__edward_intended_route');
  if (intendedRoute) {
    sessionStorage.removeItem('__edward_intended_route');
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', basePath + intendedRoute);
    }
  }
})();
</script>`;
}

export function injectRuntimeScriptIntoHtml(html: string, runtimeConfig: RuntimeConfig): string {
  const script = generateRuntimeScript(runtimeConfig);

  if (html.includes('</head>')) {
    return html.replace('</head>', `${script}\n</head>`);
  }

  if (html.includes('<body')) {
    return html.replace(/<body([^>]*)>/, `<body$1>\n${script}`);
  }

  return script + html;
}