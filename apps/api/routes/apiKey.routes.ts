import { Router } from 'express';
import { getApiKey, createApiKey, updateApiKey } from '../services/apiKey/apiKey.useCase.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  CreateApiKeyRequestSchema,
  UpdateApiKeyRequestSchema,
} from '../schemas/apiKey.schema.js';

export const apiKeyRouter: Router = Router();

apiKeyRouter.get('/', getApiKey);
apiKeyRouter.post('/', validateRequest(CreateApiKeyRequestSchema), createApiKey);
apiKeyRouter.put('/', validateRequest(UpdateApiKeyRequestSchema), updateApiKey);
