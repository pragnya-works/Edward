ALTER TABLE "message" ADD COLUMN "completion_time" integer;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "output_tokens" integer;