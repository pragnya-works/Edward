import type { Response } from "express";
import {
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import {
  connectRepo as connectRepoInternal,
  createBranch as createBranchInternal,
  githubStatus as githubStatusInternal,
  syncRepo as syncRepoInternal,
} from "../services/github/controller.service.js";

export async function connectRepo(
  req: AuthenticatedRequest,
  res: Response,
  next: (err?: unknown) => void,
): Promise<void> {
  await connectRepoInternal(req, res, next);
}

export async function createBranch(
  req: AuthenticatedRequest,
  res: Response,
  next: (err?: unknown) => void,
): Promise<void> {
  await createBranchInternal(req, res, next);
}

export async function syncRepo(
  req: AuthenticatedRequest,
  res: Response,
  next: (err?: unknown) => void,
): Promise<void> {
  await syncRepoInternal(req, res, next);
}

export async function githubStatus(
  req: AuthenticatedRequest,
  res: Response,
  next: (err?: unknown) => void,
): Promise<void> {
  await githubStatusInternal(req, res, next);
}
