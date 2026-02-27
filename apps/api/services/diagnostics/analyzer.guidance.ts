import type { BuildError } from "./types.js";

export type DiagnosisGuidance = {
  probableCause: string;
  pinpointContext: string;
  preciseFix: string;
  nextStep: string;
};

function buildLocation(error: BuildError): string {
  return `${error.error.file}:${error.error.line}${error.error.column ? `:${error.error.column}` : ""}`;
}

function firstLine(text: string): string {
  return text.split("\n")[0] || text;
}

function isViteInternalCompatibilityFailure(error: BuildError): boolean {
  const file = error.error.file.toLowerCase();
  const message = firstLine(error.error.message).toLowerCase();

  if (!file.includes("/node_modules/")) return false;
  if (!file.includes("/vite/dist/node/chunks/config.js")) return false;

  return (
    message.includes("crypto.hash is not a function") ||
    message.includes("runtime error") ||
    message.includes("typeerror")
  );
}

export function buildDiagnosisGuidance(error: BuildError): DiagnosisGuidance {
  const location = buildLocation(error);
  const target = error.error.target ? `'${error.error.target}'` : "the referenced symbol";
  const importHint = error.context.importChain?.[0];
  const relatedHint = error.relatedFiles?.[0];

  switch (error.type) {
    case "missing_import": {
      const importContext = importHint
        ? `Import chain points to '${importHint.importPath}' from ${importHint.file}:${importHint.line}.`
        : relatedHint
          ? `Related usage was also detected in ${relatedHint.path}.`
          : `No valid import/provider was found for ${target}.`;
      return {
        probableCause: "A dependency or import path is missing, invalid, or unresolved.",
        pinpointContext: `At ${location}, the compiler cannot resolve ${target}. ${importContext}`,
        preciseFix: importHint
          ? `Edit ${importHint.file}:${importHint.line} and correct the import path/package '${importHint.importPath}'. If it is an external package, install it in the sandbox and rerun the build there.`
          : `Open ${error.error.file}:${error.error.line}, add/correct the import for ${target}, ensure the source exports it, then rerun the build in the sandbox.`,
        nextStep: "Correct the import/dependency resolution at the pinpointed location and rerun the build in the sandbox.",
      };
    }
    case "type_mismatch": {
      const msg = firstLine(error.error.message);
      if (error.error.code === "TS2304") {
        return {
          probableCause: "A referenced name is used without a valid declaration or import.",
          pinpointContext: `At ${location}, TypeScript cannot find ${target}. This stops typecheck before bundling.`,
          preciseFix: `In ${error.error.file}:${error.error.line}, either import ${target} from the correct module or declare it in scope, then rerun the build in the sandbox.`,
          nextStep: "Restore symbol visibility (import/declaration) at the pinpointed line and rerun the build in the sandbox.",
        };
      }
      return {
        probableCause: "TypeScript found a mismatch between expected and actual types.",
        pinpointContext: `At ${location}, typecheck fails with: ${msg}`,
        preciseFix: `Open ${error.error.file}:${error.error.line} and align the value/prop/function signature to the expected type, then rerun the build in the sandbox.`,
        nextStep: "Fix the type mismatch at the pinpointed line and rerun the build in the sandbox.",
      };
    }
    case "syntax": {
      const snippet = firstLine(error.error.snippet || "").trim();
      return {
        probableCause: "The parser found invalid syntax in source code.",
        pinpointContext: snippet
          ? `At ${location}, parsing failed near: ${snippet}`
          : `At ${location}, parsing failed due to invalid token/structure.`,
        preciseFix: `Open ${error.error.file}:${error.error.line}, fix bracket/quote/operator structure around the pinpoint, then rerun the build in the sandbox.`,
        nextStep: "Correct syntax exactly at the pinpoint and rerun the build in the sandbox.",
      };
    }
    case "config": {
      const msg = firstLine(error.error.message);
      const msgLower = msg.toLowerCase();
      if (
        msgLower.includes("eisdir") ||
        msgLower.includes("illegal operation on a directory")
      ) {
        return {
          probableCause:
            "An HTML asset URL points to a directory path, so Vite is trying to read a directory as a file during build-html.",
          pinpointContext:
            `At ${location}, Vite reported directory-read failure (${msg}). This commonly happens when index.html uses canonical/asset href values like '/'.`,
          preciseFix:
            "Edit index.html and make canonical/asset href values absolute http(s) URLs (for example, https://edwardd.app/), not '/'. Then rerun the build in the sandbox.",
          nextStep:
            "Fix canonical/asset hrefs in index.html and rerun the build in the sandbox.",
        };
      }
      return {
        probableCause: "A framework/build configuration key or value is invalid.",
        pinpointContext: `At ${location}, config validation failed: ${msg}`,
        preciseFix: `Edit ${error.error.file}${error.error.line > 0 ? `:${error.error.line}` : ""} and replace/remove the invalid config option causing the failure, then rerun the build in the sandbox.`,
        nextStep: "Update the invalid config key/value and rerun the build in the sandbox.",
      };
    }
    case "runtime": {
      const msg = firstLine(error.error.message);
      if (isViteInternalCompatibilityFailure(error)) {
        return {
          probableCause:
            "Vite crashed inside its own runtime bundle because the Node.js runtime and installed Vite version are incompatible.",
          pinpointContext:
            `At ${location}, execution failed inside Vite internals (${msg}). This is usually environment/toolchain mismatch, not an application source bug.`,
          preciseFix:
            "Do not edit node_modules. Use Node.js 20.19+ (or 22+), and keep Vite on a compatible major (for older runtimes, pin vite@^6 with matching plugins), then reinstall dependencies and rerun the build in the sandbox.",
          nextStep:
            "Align Node/Vite versions, reinstall dependencies, and rerun the build in the sandbox.",
        };
      }
      return {
        probableCause: "A runtime execution path failed during build or prerender.",
        pinpointContext: `At ${location}, runtime execution failed with: ${msg}`,
        preciseFix: `Open ${error.error.file}:${error.error.line}, guard unsafe runtime assumptions (null/undefined/env/path), then rerun the build in the sandbox.`,
        nextStep: "Harden runtime path at pinpoint and rerun the build in the sandbox.",
      };
    }
    case "resource":
      return {
        probableCause: "Build process exceeded available compute resources.",
        pinpointContext: `Build failed around ${location} while processing a resource-heavy step.`,
        preciseFix: "Reduce bundle/build load (heavy plugins/assets), or increase memory limits, then rerun the build in the sandbox.",
        nextStep: "Lower build resource pressure and rerun the build in the sandbox.",
      };
    case "network":
      return {
        probableCause: "Required network access failed during dependency/build operations.",
        pinpointContext: `Failure surfaced near ${location} because registry/network requests did not complete.`,
        preciseFix: "Retry when network/registry is healthy; if reproducible, pin/fix registry configuration and rerun the build in the sandbox.",
        nextStep: "Restore connectivity and rerun the build in the sandbox.",
      };
    case "environment":
      if (isViteInternalCompatibilityFailure(error)) {
        return {
          probableCause:
            "The build runtime does not satisfy the installed Vite toolchain requirements.",
          pinpointContext:
            `Failure surfaced at ${location} inside Vite internals, indicating runtime/tooling mismatch rather than user code failure.`,
          preciseFix:
            "Upgrade Node.js in the sandbox/runtime (20.19+ or 22+), or pin Vite to a compatible major, then reinstall dependencies and rerun the build in the sandbox.",
          nextStep:
            "Fix runtime/toolchain compatibility and rerun the build in the sandbox.",
        };
      }
      return {
        probableCause: "Tooling/runtime environment is missing required command, permission, or configuration.",
        pinpointContext: `Build stopped near ${location} due to environment prerequisites not being met.`,
        preciseFix: "Verify required build tools/versions/permissions in the environment, then rerun the build in the sandbox.",
        nextStep: "Fix environment prerequisites and rerun the build in the sandbox.",
      };
    default: {
      const msg = firstLine(error.error.message);
      return {
        probableCause: "An unclassified build error blocked compilation.",
        pinpointContext: `At ${location}, build failed with: ${msg}`,
        preciseFix: `Start with ${error.error.file}:${error.error.line}, resolve the first error completely, then rerun the build in the sandbox to reveal any next blocker.`,
        nextStep: "Resolve the first pinpointed blocker and rerun the build in the sandbox.",
      };
    }
  }
}
