import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import {
  createApiKey,
  deleteApiKey,
  getApiKey,
  updateApiKey,
} from "../../controllers/apiKey.controller.js";

const mockRefs = vi.hoisted(() => ({
  getApiKeyInternal: vi.fn(),
  createApiKeyInternal: vi.fn(),
  updateApiKeyInternal: vi.fn(),
  deleteApiKeyInternal: vi.fn(),
}));

vi.mock("../../services/apiKey/controller.service.js", () => ({
  getApiKey: mockRefs.getApiKeyInternal,
  createApiKey: mockRefs.createApiKeyInternal,
  updateApiKey: mockRefs.updateApiKeyInternal,
  deleteApiKey: mockRefs.deleteApiKeyInternal,
}));

describe("apiKey controller delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates getApiKey to service module", async () => {
    const req = {} as AuthenticatedRequest;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    await getApiKey(req, res, next);

    expect(mockRefs.getApiKeyInternal).toHaveBeenCalledWith(req, res, next);
  });

  it("delegates createApiKey to service module", async () => {
    const req = {} as AuthenticatedRequest;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    await createApiKey(req, res, next);

    expect(mockRefs.createApiKeyInternal).toHaveBeenCalledWith(req, res, next);
  });

  it("delegates updateApiKey to service module", async () => {
    const req = {} as AuthenticatedRequest;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    await updateApiKey(req, res, next);

    expect(mockRefs.updateApiKeyInternal).toHaveBeenCalledWith(req, res, next);
  });

  it("delegates deleteApiKey to service module", async () => {
    const req = {} as AuthenticatedRequest;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    await deleteApiKey(req, res, next);

    expect(mockRefs.deleteApiKeyInternal).toHaveBeenCalledWith(req, res, next);
  });
});
