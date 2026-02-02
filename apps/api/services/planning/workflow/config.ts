import { PhaseConfig } from '../schemas.js';

export const PHASE_CONFIGS: PhaseConfig[] = [
  { name: 'ANALYZE', executor: 'llm', maxRetries: 2, timeoutMs: 30000 },
  { name: 'RESOLVE_PACKAGES', executor: 'worker', maxRetries: 3, timeoutMs: 60000 },
  { name: 'INSTALL_PACKAGES', executor: 'worker', maxRetries: 3, timeoutMs: 120000 },
  { name: 'GENERATE', executor: 'hybrid', maxRetries: 2, timeoutMs: 120000 },
  { name: 'BUILD', executor: 'worker', maxRetries: 3, timeoutMs: 180000 },
  { name: 'DEPLOY', executor: 'worker', maxRetries: 2, timeoutMs: 60000 },
  { name: 'RECOVER', executor: 'llm', maxRetries: 2, timeoutMs: 60000 },
];
