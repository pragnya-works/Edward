ALTER TABLE "chat" ADD COLUMN "custom_subdomain" text;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_custom_subdomain_unique" ON "chat" USING btree ("custom_subdomain");