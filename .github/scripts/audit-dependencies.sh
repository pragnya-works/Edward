#!/usr/bin/env bash
set -euo pipefail

is_registry_5xx() {
  grep -Eq "ERR_PNPM_AUDIT_BAD_RESPONSE|responded with 5[0-9][0-9]|Internal Server Error"
}

run_audit() {
  pnpm audit --audit-level=high 2>&1
}

output="$(run_audit)" && {
  echo "$output"
  exit 0
}
echo "$output"

if echo "$output" | is_registry_5xx; then
  echo "Audit API unavailable. Retrying once in 15s..."
  sleep 15
  output="$(run_audit)" && {
    echo "$output"
    exit 0
  }
  echo "$output"

  if echo "$output" | is_registry_5xx; then
    echo "::warning::Skipping audit due to npm registry audit API 5xx."
    exit 0
  fi
fi

echo "Dependency audit failed due to vulnerabilities or non-transient error."
exit 1
