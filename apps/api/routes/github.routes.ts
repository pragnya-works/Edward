import { Router } from 'express';
import {
  connectRepo,
  createBranch,
  syncRepo,
  githubStatus,
} from '../controllers/github.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  ConnectRepoRequestSchema,
  CreateBranchRequestSchema,
  GithubStatusRequestSchema,
  SyncRepoRequestSchema,
} from '../schemas/github.schema.js';
import {
  githubRateLimiter,
  dailyGithubRateLimiter,
} from '../middleware/rateLimit.js';

const router = Router();

router.use(githubRateLimiter, dailyGithubRateLimiter);

router.get('/status', validateRequest(GithubStatusRequestSchema), githubStatus);
router.post('/connect', validateRequest(ConnectRepoRequestSchema), connectRepo);
router.post('/branch', validateRequest(CreateBranchRequestSchema), createBranch);
router.post('/sync', validateRequest(SyncRepoRequestSchema), syncRepo);

export const githubRouter: Router = router;
