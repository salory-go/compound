-- Migration: create_entries_table
-- Run this in Supabase SQL Editor or via CLI

-- Entries table for Compound
CREATE TABLE IF NOT EXISTS entries (
  id DATE PRIMARY KEY,
  text TEXT NOT NULL DEFAULT '',
  health JSONB DEFAULT '{}',
  energy SMALLINT DEFAULT 0 CHECK (energy >= 0 AND energy <= 5),
  tomorrow TEXT DEFAULT '',
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for sorting by date
CREATE INDEX IF NOT EXISTS idx_entries_id_desc ON entries (id DESC);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entries_updated_at
  BEFORE UPDATE ON entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable Row Level Security
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anonymous/publishable key users
CREATE POLICY "Allow anonymous access" ON entries
  FOR ALL
  USING (true)
  WITH CHECK (true);
