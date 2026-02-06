import { Router } from 'express';
import { connectRepo, createBranch, syncRepo } from '../controllers/github.controller.js';

const router = Router();

router.post('/connect', connectRepo);
router.post('/branch', createBranch);
router.post('/sync', syncRepo);

export const githubRouter: Router = router;
