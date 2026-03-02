import dns from "node:dns/promises";
import net from "node:net";

export interface ResolvedUrlTarget {
  address: string;
  family: 4 | 6;
}

function isBlockedHostname(
  hostname: string,
  blockedHostnames: ReadonlySet<string>,
): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (blockedHostnames.has(normalized)) return true;

  return (
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (
    parts.length !== 4 ||
    parts.some((value) => Number.isNaN(value) || value < 0 || value > 255)
  ) {
    return false;
  }

  const [a, b, c] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  return false;
}

function getMappedIPv4Address(address: string): string | null {
  const normalized = address.trim().toLowerCase();
  if (!normalized.startsWith("::ffff:")) {
    return null;
  }

  const mapped = normalized.slice("::ffff:".length);
  if (!mapped) {
    return null;
  }

  if (net.isIP(mapped) === 4) {
    return mapped;
  }

  const parts = mapped.split(":");
  if (
    parts.length !== 2 ||
    parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))
  ) {
    return null;
  }

  const high = Number.parseInt(parts[0] ?? "", 16);
  const low = Number.parseInt(parts[1] ?? "", 16);
  if (Number.isNaN(high) || Number.isNaN(low)) {
    return null;
  }

  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  const mappedIPv4 = getMappedIPv4Address(normalized);
  if (mappedIPv4) {
    return isPrivateIPv4(mappedIPv4);
  }

  return false;
}

function isPrivateAddress(address: string): boolean {
  const ipVersion = net.isIP(address);
  if (ipVersion === 4) return isPrivateIPv4(address);
  if (ipVersion === 6) return isPrivateIPv6(address);
  return false;
}

function normalizeHostnameForIpChecks(hostname: string): string {
  const normalized = hostname.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

export async function resolveSafeUrlTarget(
  url: URL,
  blockedHostnames: ReadonlySet<string>,
): Promise<ResolvedUrlTarget> {
  const hostname = normalizeHostnameForIpChecks(url.hostname);
  if (isBlockedHostname(hostname, blockedHostnames)) {
    throw new Error(`URL host is not allowed: ${hostname}`);
  }

  const ipVersion = net.isIP(hostname);
  if (ipVersion > 0) {
    if (isPrivateAddress(hostname)) {
      throw new Error(`Private IP targets are not allowed: ${hostname}`);
    }
    return {
      address: hostname,
      family: ipVersion as 4 | 6,
    };
  }

  const resolved = await dns.lookup(hostname, { all: true, verbatim: true });
  if (resolved.length === 0) {
    throw new Error(`Unable to resolve host: ${hostname}`);
  }

  for (const entry of resolved) {
    if (isPrivateAddress(entry.address)) {
      throw new Error(`Resolved private IP is not allowed: ${entry.address}`);
    }
  }

  const selected = resolved[0];
  if (!selected) {
    throw new Error(`Unable to resolve host: ${hostname}`);
  }

  return {
    address: selected.address,
    family: selected.family as 4 | 6,
  };
}
