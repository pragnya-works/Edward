import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../../../middleware/auth.js";
import {
  checkSubdomainAvailabilityHandler,
  updateChatSubdomainHandler,
} from "../../../controllers/chat/subdomain.controller.js";

const mockRefs = vi.hoisted(() => ({
  checkSubdomainAvailabilityInternal: vi.fn(),
  updateChatSubdomainInternal: vi.fn(),
}));

vi.mock("../../../services/previewRouting/subdomainUpdate.service.js", () => ({
  checkSubdomainAvailability: mockRefs.checkSubdomainAvailabilityInternal,
  updateChatSubdomain: mockRefs.updateChatSubdomainInternal,
}));

describe("subdomain controller delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates checkSubdomainAvailabilityHandler to service module", async () => {
    const req = {} as AuthenticatedRequest;
    const res = {} as Response;

    await checkSubdomainAvailabilityHandler(req, res);

    expect(mockRefs.checkSubdomainAvailabilityInternal).toHaveBeenCalledWith(req, res);
  });

  it("delegates updateChatSubdomainHandler to service module", async () => {
    const req = {} as AuthenticatedRequest;
    const res = {} as Response;

    await updateChatSubdomainHandler(req, res);

    expect(mockRefs.updateChatSubdomainInternal).toHaveBeenCalledWith(req, res);
  });
});
