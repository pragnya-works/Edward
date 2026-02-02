import { z } from 'zod';

export enum JobType {
  BUILD = 'build',
  BACKUP = 'backup',
  CLEANUP = 'cleanup',
}

export const BuildJobPayloadSchema = z.object({
  type: z.literal(JobType.BUILD),
  sandboxId: z.string(),
  userId: z.string(),
  chatId: z.string(),
});
export type BuildJobPayload = z.infer<typeof BuildJobPayloadSchema>;

export const BackupJobPayloadSchema = z.object({
  type: z.literal(JobType.BACKUP),
  sandboxId: z.string(),
  userId: z.string(),
});
export type BackupJobPayload = z.infer<typeof BackupJobPayloadSchema>;

export const CleanupJobPayloadSchema = z.object({
  type: z.literal(JobType.CLEANUP),
  sandboxId: z.string(),
  userId: z.string(),
  reason: z.string().optional(),
});
export type CleanupJobPayload = z.infer<typeof CleanupJobPayloadSchema>;

export const JobPayloadSchema = z.discriminatedUnion('type', [
  BuildJobPayloadSchema,
  BackupJobPayloadSchema,
  CleanupJobPayloadSchema,
]);
export type JobPayload = z.infer<typeof JobPayloadSchema>;
