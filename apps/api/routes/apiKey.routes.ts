import { Router, type Router as ExpressRouter } from 'express';
import { getApiKey, createApiKey, updateApiKey, deleteApiKey } from '../controllers/apiKey.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  CreateApiKeyRequestSchema,
  UpdateApiKeyRequestSchema,
} from '../schemas/apiKey.schema.js';

export function createApiKeyRouter(): ExpressRouter {
  const router = Router();

  router.get('/', getApiKey);
  router.post('/', validateRequest(CreateApiKeyRequestSchema), createApiKey);
  router.put('/', validateRequest(UpdateApiKeyRequestSchema), updateApiKey);
  router.delete('/', deleteApiKey);

  return router;
}