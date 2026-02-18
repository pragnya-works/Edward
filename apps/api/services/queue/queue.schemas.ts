import { z } from "zod";

export enum JobType {
  BUILD = "build",
  BACKUP = "backup",
}

export const BuildJobPayloadSchema = z.object({
  type: z.literal(JobType.BUILD),
  sandboxId: z.string(),
  userId: z.string(),
  chatId: z.string(),
  messageId: z.string(),
  runId: z.string().optional(),
  buildId: z.string().optional(),
});
export type BuildJobPayload = z.infer<typeof BuildJobPayloadSchema>;

export const BackupJobPayloadSchema = z.object({
  type: z.literal(JobType.BACKUP),
  sandboxId: z.string(),
  userId: z.string(),
});
export type BackupJobPayload = z.infer<typeof BackupJobPayloadSchema>;

export const JobPayloadSchema = z.discriminatedUnion("type", [
  BuildJobPayloadSchema,
  BackupJobPayloadSchema,
]);
export type JobPayload = z.infer<typeof JobPayloadSchema>;
