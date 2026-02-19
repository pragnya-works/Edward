CREATE TYPE "public"."run_state" AS ENUM('INIT', 'LLM_STREAM', 'TOOL_EXEC', 'APPLY', 'NEXT_TURN', 'COMPLETE', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "run" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_message_id" text NOT NULL,
	"assistant_message_id" text NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"state" "run_state" DEFAULT 'INIT' NOT NULL,
	"current_turn" integer DEFAULT 0 NOT NULL,
	"next_event_seq" integer DEFAULT 0 NOT NULL,
	"model" text,
	"intent" text,
	"loop_stop_reason" text,
	"termination_reason" text,
	"error_message" text,
	"metadata" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_event" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"seq" integer NOT NULL,
	"event_type" text NOT NULL,
	"event" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_tool_call" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"turn" integer DEFAULT 0 NOT NULL,
	"tool_name" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"status" text NOT NULL,
	"error_message" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_user_message_id_message_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_event" ADD CONSTRAINT "run_event_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_tool_call" ADD CONSTRAINT "run_tool_call_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_run_chat_id" ON "run" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "idx_run_user_id" ON "run" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_run_status" ON "run" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "run_event_run_id_seq_unique" ON "run_event" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "idx_run_event_run_id_seq" ON "run_event" USING btree ("run_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "run_tool_call_run_id_idempotency_key_unique" ON "run_tool_call" USING btree ("run_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_run_tool_call_run_id" ON "run_tool_call" USING btree ("run_id");