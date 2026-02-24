import { describe, expect, it } from "vitest";
import { fetchWithSafeRedirects } from "../../../services/network/safeFetch.js";

describe("safeFetch", () => {
  it("blocks bracketed IPv6 loopback hosts before DNS resolution", async () => {
    const abortController = new AbortController();

    await expect(
      fetchWithSafeRedirects("http://[::1]/", {
        signal: abortController.signal,
      }),
    ).rejects.toThrow("URL host is not allowed");
  });

  it.each([
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[::ffff:a9fe:a9fe]/",
  ])(
    "blocks IPv4-mapped IPv6 private targets (%s)",
    async (targetUrl) => {
      const abortController = new AbortController();

      await expect(
        fetchWithSafeRedirects(targetUrl, {
          signal: abortController.signal,
        }),
      ).rejects.toThrow("Private IP targets are not allowed");
    },
  );
});
