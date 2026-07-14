export type SourceType = "youtube" | "article" | "note" | "document" | "image" | "audio" | "video" | "file";

export type TranscriptStatus = "not_requested" | "fetching" | "ready" | "failed" | "not_applicable";

export interface ContentItem {
  id: string;
  board_id: string;
  source_type: SourceType;
  canonical_url: string | null;
  external_id: string | null;
  title: string;
  author: string | null;
  description: string | null;
  content_text: string | null;
  transcript_text: string | null;
  transcript_status: TranscriptStatus;
  transcript_origin: string | null;
  transcript_language: string | null;
  transcript_error: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  duration_seconds: number | null;
  view_count: number | null;
  mime_type: string | null;
  file_path: string | null;
  preview_path: string | null;
  file_name: string | null;
  file_size: number | null;
  trashed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Board {
  id: string;
  name: string;
  folder_id: string | null;
  sort_order: number;
  trashed_at: string | null;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  trashed_at: string | null;
  board_count: number;
  source_count: number;
  created_at: string;
  updated_at: string;
}

export interface VaultStats {
  total: number;
  youtube: number;
  article: number;
  note: number;
  file: number;
  ready_transcripts: number;
}
