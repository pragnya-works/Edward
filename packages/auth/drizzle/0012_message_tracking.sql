-- Migration: Add message tracking columns
-- Adds columns for tracking per-message completion time and token consumption
-- This enables tracking metrics for assistant messages only

ALTER TABLE message 
ADD COLUMN IF NOT EXISTS completion_time INTEGER,
ADD COLUMN IF NOT EXISTS input_tokens INTEGER,
ADD COLUMN IF NOT EXISTS output_tokens INTEGER;

-- Create index for faster queries on completion time
CREATE INDEX IF NOT EXISTS idx_message_completion_time ON message(completion_time) 
WHERE completion_time IS NOT NULL;

-- Create index for faster queries on token usage
CREATE INDEX IF NOT EXISTS idx_message_tokens ON message(input_tokens, output_tokens) 
WHERE input_tokens IS NOT NULL OR output_tokens IS NOT NULL;
