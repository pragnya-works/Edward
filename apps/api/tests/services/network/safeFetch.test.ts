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
});
