import { Router } from 'express';
import { connectRepo, createBranch, syncRepo } from '../controllers/github.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  ConnectRepoSchema,
  CreateBranchSchema,
  SyncRepoSchema,
} from '../schemas/github.schema.js';

const router = Router();

router.post('/connect', validateRequest(ConnectRepoSchema), connectRepo);
router.post('/branch', validateRequest(CreateBranchSchema), createBranch);
router.post('/sync', validateRequest(SyncRepoSchema), syncRepo);

export const githubRouter: Router = router;
