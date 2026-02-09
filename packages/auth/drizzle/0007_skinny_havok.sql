CREATE TYPE "public"."build_status" AS ENUM('queued', 'building', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "build" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"message_id" text NOT NULL,
	"status" "build_status" DEFAULT 'queued' NOT NULL,
	"error_log" text,
	"preview_url" text,
	"build_duration" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "build" ADD CONSTRAINT "build_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build" ADD CONSTRAINT "build_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;