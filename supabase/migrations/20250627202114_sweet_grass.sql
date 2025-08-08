/*
  # Create news_matches table for real-time news monitoring

  1. New Tables
    - `news_matches`
      - `id` (bigint, primary key, generated always as identity)
      - `created_at` (timestamptz, default now())
      - `contact_id` (bigint, foreign key to contacts.id)
      - `contact_name` (text)
      - `contact_category` (text)
      - `article_title` (text)
      - `article_url` (text)
      - `publication` (text)
      - `match_location` (text)
      - `excerpt` (text)
      - `found_at` (timestamptz)
      - `is_new` (boolean, default true)
      - `is_read` (boolean, default false)

  2. Security
    - Enable RLS on `news_matches` table
    - Add policies for authenticated users to read and manage their matches

  3. Constraints
    - Unique constraint on (article_url, contact_id) to prevent duplicates
    - Foreign key constraint to contacts table
</*/

-- Create the news_matches table
CREATE TABLE IF NOT EXISTS news_matches (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_at timestamptz DEFAULT now(),
  contact_id bigint NOT NULL,
  contact_name text NOT NULL,
  contact_category text DEFAULT 'OTHER',
  article_title text NOT NULL,
  article_url text NOT NULL,
  publication text NOT NULL,
  match_location text NOT NULL,
  excerpt text DEFAULT '',
  found_at timestamptz DEFAULT now(),
  is_new boolean DEFAULT true,
  is_read boolean DEFAULT false,
  
  -- Foreign key constraint
  CONSTRAINT fk_news_matches_contact_id 
    FOREIGN KEY (contact_id) 
    REFERENCES contacts(id) 
    ON DELETE CASCADE,
  
  -- Unique constraint to prevent duplicates
  CONSTRAINT unique_news_match 
    UNIQUE (article_url, contact_id)
);

-- Enable Row Level Security
ALTER TABLE news_matches ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Users can read all news matches"
  ON news_matches
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert news matches"
  ON news_matches
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update news matches"
  ON news_matches
  FOR UPDATE
  TO authenticated
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_news_matches_contact_id ON news_matches(contact_id);
CREATE INDEX IF NOT EXISTS idx_news_matches_created_at ON news_matches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_matches_publication ON news_matches(publication);
CREATE INDEX IF NOT EXISTS idx_news_matches_is_read ON news_matches(is_read);
CREATE INDEX IF NOT EXISTS idx_news_matches_found_at ON news_matches(found_at DESC);