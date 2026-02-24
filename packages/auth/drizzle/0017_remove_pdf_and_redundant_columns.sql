DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "attachment" WHERE "type" = 'pdf') THEN
		RAISE EXCEPTION 'Cannot remove attachment_type.pdf while pdf attachments still exist';
	END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "chat" DROP CONSTRAINT "chat_original_chat_id_fk";
--> statement-breakpoint
ALTER TABLE "chat" DROP CONSTRAINT "chat_root_chat_id_fk";
--> statement-breakpoint
ALTER TABLE "attachment" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."attachment_type";--> statement-breakpoint
CREATE TYPE "public"."attachment_type" AS ENUM('image', 'figma');--> statement-breakpoint
ALTER TABLE "attachment" ALTER COLUMN "type" SET DATA TYPE "public"."attachment_type" USING "type"::"public"."attachment_type";--> statement-breakpoint
ALTER TABLE "chat" DROP COLUMN "github_repo_id";--> statement-breakpoint
ALTER TABLE "chat" DROP COLUMN "is_favourite";--> statement-breakpoint
ALTER TABLE "chat" DROP COLUMN "original_chat_id";--> statement-breakpoint
ALTER TABLE "chat" DROP COLUMN "root_chat_id";--> statement-breakpoint
ALTER TABLE "run" DROP COLUMN "model";--> statement-breakpoint
ALTER TABLE "run" DROP COLUMN "intent";
