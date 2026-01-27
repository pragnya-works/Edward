import { Router } from 'express';
import { getApiKey, createApiKey, updateApiKey, deleteApiKey } from '../controllers/apiKey.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  CreateApiKeyRequestSchema,
  UpdateApiKeyRequestSchema,
} from '../schemas/apiKey.schema.js';

export const apiKeyRouter: Router = Router();

apiKeyRouter.get('/', getApiKey);
apiKeyRouter.post('/', validateRequest(CreateApiKeyRequestSchema), createApiKey);
apiKeyRouter.put('/', validateRequest(UpdateApiKeyRequestSchema), updateApiKey);
apiKeyRouter.delete('/', deleteApiKey);