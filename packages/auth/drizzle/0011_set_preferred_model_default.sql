-- Custom migration to set default preferred_model and make it NOT NULL

-- First, update all existing NULL values to the default
UPDATE "user" SET "preferred_model" = 'gemini-2.5-flash' WHERE "preferred_model" IS NULL;

-- Then set the default for future inserts
ALTER TABLE "user" ALTER COLUMN "preferred_model" SET DEFAULT 'gemini-2.5-flash';

-- Finally, make the column NOT NULL
ALTER TABLE "user" ALTER COLUMN "preferred_model" SET NOT NULL;