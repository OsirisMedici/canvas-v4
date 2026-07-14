CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS vault_schema_migrations (
  version integer PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO vault_schema_migrations (version, name)
VALUES (1, 'baseline boards, items, and chats')
ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES folders(id) ON DELETE SET NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  trashed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT folders_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE IF NOT EXISTS boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO boards (id, name)
VALUES ('11111111-1111-4111-8111-111111111111', 'My Library')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS folder_id uuid,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trashed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boards_folder_id_fkey'
  ) THEN
    ALTER TABLE boards
      ADD CONSTRAINT boards_folder_id_fkey
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS folders_parent_idx ON folders (parent_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS folders_active_idx ON folders (trashed_at) WHERE trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS boards_folder_idx ON boards (folder_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS boards_active_idx ON boards (trashed_at) WHERE trashed_at IS NULL;

INSERT INTO vault_schema_migrations (version, name)
VALUES (2, 'nested folders and board trash metadata')
ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL DEFAULT '11111111-1111-4111-8111-111111111111' REFERENCES boards(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('youtube', 'article', 'note', 'document', 'image', 'audio', 'video', 'file')),
  canonical_url text,
  external_id text,
  title text NOT NULL,
  author text,
  description text,
  content_text text,
  transcript_text text,
  transcript_status text NOT NULL DEFAULT 'not_requested' CHECK (transcript_status IN ('not_requested', 'fetching', 'ready', 'failed', 'not_applicable')),
  transcript_origin text,
  transcript_language text,
  transcript_error text,
  thumbnail_url text,
  published_at timestamptz,
  duration_seconds integer,
  view_count bigint,
  mime_type text,
  file_path text,
  preview_path text,
  file_name text,
  file_size bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english'::regconfig,
      coalesce(title, '') || ' ' || coalesce(author, '') || ' ' || coalesce(description, '') || ' ' || coalesce(content_text, '') || ' ' || coalesce(transcript_text, '')
    )
  ) STORED
);

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS board_id uuid,
  ADD COLUMN IF NOT EXISTS preview_path text,
  ADD COLUMN IF NOT EXISTS trashed_at timestamptz;

UPDATE content_items
SET board_id = '11111111-1111-4111-8111-111111111111'
WHERE board_id IS NULL;

ALTER TABLE content_items
  ALTER COLUMN board_id SET DEFAULT '11111111-1111-4111-8111-111111111111',
  ALTER COLUMN board_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_items_board_id_fkey'
  ) THEN
    ALTER TABLE content_items
      ADD CONSTRAINT content_items_board_id_fkey
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS content_items_canonical_url_unique
  ON content_items (canonical_url) WHERE canonical_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_items_search_idx ON content_items USING gin (search_vector);
CREATE INDEX IF NOT EXISTS content_items_created_idx ON content_items (created_at DESC);
CREATE INDEX IF NOT EXISTS content_items_source_type_idx ON content_items (source_type);
CREATE INDEX IF NOT EXISTS content_items_board_idx ON content_items (board_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_items_active_idx ON content_items (trashed_at) WHERE trashed_at IS NULL;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  scope_type text NOT NULL CHECK (scope_type IN ('board', 'selection')),
  source_item_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS trashed_at timestamptz;

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  job_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  source_url text,
  bytes_processed bigint,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS chat_sessions_board_idx ON chat_sessions (board_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages (session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS ingest_jobs_started_idx ON ingest_jobs (started_at DESC);

INSERT INTO vault_schema_migrations (version, name)
VALUES (3, 'trash metadata and ingestion job history')
ON CONFLICT (version) DO NOTHING;
