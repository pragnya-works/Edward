import { vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.AWS_BUCKET_NAME = 'test-bucket';
process.env.AWS_REGION = 'us-east-1';
process.env.OPENAI_MODEL = 'gpt-4';
process.env.GEMINI_MODEL = 'gemini-pro';
process.env.GITHUB_CLIENT_ID = 'test-client-id';
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.EDWARD_API_PORT = '3001';

vi.mock('../lib/redis.js', () => ({
  redis: {
    call: vi.fn(),
    on: vi.fn(),
    quit: vi.fn(),
  },
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Job: vi.fn(),
}));

vi.mock('@edward/auth', async () => {
  const actual = await vi.importActual<typeof import('@edward/auth')>('@edward/auth');
  return {
    ...actual,
    auth: {
      api: {
        getSession: vi.fn(),
      },
    },
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
      orderBy: vi.fn().mockReturnThis(),
    },
    user: {},
    chat: {},
    message: {},
    eq: vi.fn(),
  };
});

vi.mock('dockerode', () => ({
  default: vi.fn().mockImplementation(() => ({
    createContainer: vi.fn().mockResolvedValue({
      id: 'test-container-id',
      start: vi.fn().mockResolvedValue(undefined),
      exec: vi.fn().mockResolvedValue({
        start: vi.fn().mockResolvedValue({
          on: vi.fn(),
        }),
      }),
      remove: vi.fn().mockResolvedValue(undefined),
      inspect: vi.fn().mockResolvedValue({
        State: { Running: true },
      }),
    }),
    getContainer: vi.fn().mockReturnValue({
      inspect: vi.fn().mockResolvedValue({
        State: { Running: true },
      }),
      remove: vi.fn().mockResolvedValue(undefined),
    }),
    listContainers: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  })),
  ListObjectsV2Command: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectsCommand: vi.fn(),
}));

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: vi.fn().mockImplementation(() => ({
    done: vi.fn().mockResolvedValue({ Location: 'https://test-bucket.s3.amazonaws.com/test-key' }),
  })),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  Environment: {
    Development: 'development',
    Production: 'production',
    Test: 'test',
  },
}));
