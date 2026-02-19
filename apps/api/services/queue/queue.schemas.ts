import { z } from "zod";

export enum JobType {
  BUILD = "build",
  BACKUP = "backup",
  AGENT_RUN = "agent_run",
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

export const AgentRunJobPayloadSchema = z.object({
  type: z.literal(JobType.AGENT_RUN),
  runId: z.string(),
});
export type AgentRunJobPayload = z.infer<typeof AgentRunJobPayloadSchema>;

export const JobPayloadSchema = z.discriminatedUnion("type", [
  BuildJobPayloadSchema,
  BackupJobPayloadSchema,
  AgentRunJobPayloadSchema,
]);
export type JobPayload = z.infer<typeof JobPayloadSchema>;
