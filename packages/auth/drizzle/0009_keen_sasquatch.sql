ALTER TABLE "build" ADD COLUMN "error_report" jsonb;--> statement-breakpoint
ALTER TABLE "build" DROP COLUMN "error_log";--> statement-breakpoint
ALTER TABLE "build" DROP COLUMN "error_metadata";