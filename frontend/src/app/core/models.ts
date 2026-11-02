export interface Track {
  id: number;
  title: string;
  artist: string;
  albumartist: string;
  album: string;
  year: number | '';
  genre: string;
  track: number | '';
  length: number;
  format: string;
  bitrate: number;
  /** Channel count: 1-2 stereo/mono, more = surround (5.1, 7.1, Atmos bed) */
  channels: number;
  /** Unix seconds when the track entered the library */
  added: number;
  /** Animated cover videos stored beside the track */
  animated: ('square' | 'tall')[];
  bpm: number | '';
  rg_track_gain: number | '';
  initial_key: string;
  path: string;
  exists: boolean;
  has_lrc: boolean;
  has_ttml: boolean;
  has_cover: boolean;
  dup_group: number | null;
}

export type TagField = 'title' | 'artist' | 'albumartist' | 'album' | 'year' | 'genre';
export const TAG_FIELDS: TagField[] = ['title', 'artist', 'albumartist', 'album', 'year', 'genre'];
export const TAG_LABELS: Record<TagField, string> = {
  title: 'Title',
  artist: 'Artist',
  albumartist: 'Album artist',
  album: 'Album',
  year: 'Year',
  genre: 'Genre',
};

export interface MatchCandidate {
  source: string;
  similarity: number;
  fields: Record<TagField, string | number>;
  provenance: Record<string, string>;
}

export interface Proposal {
  candidates: MatchCandidate[];
  selected: number;
  accept: Partial<Record<TagField, boolean>>;
}

export type JobKind = 'import' | 'lyrics' | 'analyze' | 'covers';

export interface Job {
  id: string;
  kind: JobKind;
  status: 'running' | 'done' | 'error' | 'cancelled';
  total: number;
  done: number;
  message: string;
  log: string[];
  log_length: number;
}

export type DuplicateAction = 'skip' | 'keep' | 'replace';

export interface KeyField {
  id: string;
  label: string;
  secret: boolean;
  set: boolean;
  value: string;
}

export interface ProviderState {
  id: string;
  label: string;
  description: string;
  word_level: boolean;
  enabled: boolean;
  key_required: boolean;
  key_url: string;
  configured: boolean;
  key_fields: KeyField[];
}

export interface Settings {
  input_path: string;
  output_path: string;
  folder_structure: string;
  tolerance: number;
  delete_originals: boolean;
  duplicate_action: DuplicateAction;
  prune_empty_dirs: boolean;
  multichannel_path: string;
  multichannel_gain_offset: number;
  has_discogs_token: boolean;
  providers: ProviderState[];
}

export interface ProviderUpdate {
  id: string;
  enabled: boolean;
  keys: Record<string, string>;
}

export type SettingsUpdate = Partial<
  Omit<Settings, 'providers' | 'has_discogs_token'> & {
    discogs_token: string;
    lyrics_order: string[];
    providers: ProviderUpdate[];
  }
>;

export interface SystemCheck {
  name: string;
  ok: boolean;
  purpose: string;
}

export interface FsListing {
  path: string;
  parent: string | null;
  dirs: { name: string; path: string }[];
  audio_count: number;
}

export interface LyricsResult {
  id: number;
  name: string;
  status: 'success' | 'skipped' | 'not_found' | 'instrumental' | 'error';
  message: string;
}

export interface LyricsContent {
  lrc: string | null;
  ttml: string | null;
  ttml_timing: 'word' | 'line' | null;
}

export interface LyricsCandidate {
  source: string;
  score: number;
  title: string;
  artist: string;
  timing: 'word' | 'line';
  lines: number;
  native_ttml: boolean;
  lrc: string;
  ttml: string;
}

export interface CoverInfo {
  has: boolean;
  width?: number;
  height?: number;
  bytes?: number;
  mime?: string;
}

export interface CoverCandidate {
  source: string;
  label: string;
  thumb: string;
  url: string;
}

export interface TrackDetails {
  track: Track;
  fields: Record<string, string | boolean>;
}

export type InboxStatus = 'new' | 'in_library' | 'in_inbox' | 'corrupt';

export interface InboxFile {
  path: string;
  rel: string;
  size: number;
  title: string;
  artist: string;
  album: string;
  length: number;
  format: string;
  bitrate: number;
  channels: number;
  animated: ('square' | 'tall')[];
  has_cover: boolean;
  corrupt: boolean;
  has_lrc: boolean;
  has_ttml: boolean;
  has_txt: boolean;
  status: InboxStatus;
  dup_of: { id: number; path: string } | null;
}

export interface InboxScan {
  root: string;
  files: InboxFile[];
  counts: Partial<Record<InboxStatus, number>>;
  truncated: boolean;
}

export interface DuplicateGroup {
  keep_id: number;
  tracks: Track[];
}

export type AnimatedCovers = Partial<Record<'square' | 'tall', { file: string; size: number; width: number; height: number }>>;

export interface RemoteInfo {
  /** Current sharing PIN; only sent to the computer running Canto */
  pin: string | null;
  /** Whether the backend is currently reachable from other devices */
  sharing: boolean;
  /** Whether sharing is switched on automatically when Canto starts */
  auto_start: boolean;
  port: number;
  addresses: { ip: string; url: string }[];
}

export interface StructurePreview {
  samples: { sample: string; path: string }[];
}

export interface MaintenanceItem {
  count: number;
  bytes?: number;
  label: string;
  examples?: string[];
}

export type MaintenanceScan = Record<'missing' | 'tmp' | 'empty_dirs' | 'orphans' | 'db_backups' | 'http_cache', MaintenanceItem>;

export type ColumnKey =
  | 'artist'
  | 'title'
  | 'album'
  | 'year'
  | 'genre'
  | 'length'
  | 'format'
  | 'bitrate'
  | 'bpm'
  | 'albumartist'
  | 'track'
  | 'added'
  | 'rg_track_gain'
  | 'initial_key'
  | 'status'
  | 'path';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  tip: string;
  /** Hidden below the `md` breakpoint when true (cards on phones keep the essentials). */
  wide?: boolean;
}

export const COLUMNS: ColumnDef[] = [
  { key: 'title', label: 'Title', tip: 'Track title' },
  { key: 'artist', label: 'Artist', tip: 'Track artist' },
  { key: 'album', label: 'Album', tip: 'Album name', wide: true },
  { key: 'year', label: 'Year', tip: 'Release year', wide: true },
  { key: 'genre', label: 'Genre', tip: 'Genre', wide: true },
  { key: 'length', label: 'Length', tip: 'Duration', wide: true },
  { key: 'format', label: 'Format', tip: 'Audio format and channel layout', wide: true },
  { key: 'bitrate', label: 'Bitrate', tip: 'Average bitrate in kbps', wide: true },
  { key: 'bpm', label: 'BPM', tip: 'Tempo in beats per minute', wide: true },
  { key: 'albumartist', label: 'Album artist', tip: 'Album artist (used for the folder name)', wide: true },
  { key: 'track', label: '#', tip: 'Track number', wide: true },
  { key: 'added', label: 'Added', tip: 'When the song was imported into the library', wide: true },
  { key: 'rg_track_gain', label: 'Gain (dB)', tip: 'ReplayGain track gain', wide: true },
  { key: 'initial_key', label: 'Key', tip: 'Musical key' },
  { key: 'status', label: 'Status', tip: 'Cover art, lyrics and warnings' },
  { key: 'path', label: 'Path', tip: 'File location', wide: true },
];

export type LibraryFilter =
  | 'all'
  | 'no-lyrics'
  | 'no-ttml'
  | 'no-lrc'
  | 'no-cover'
  | 'no-key'
  | 'no-gain'
  | 'no-bpm'
  | 'no-tags'
  | 'complete-lyrics'
  | 'surround'
  | 'stereo'
  | 'animated'
  | 'no-animated'
  | 'lossless'
  | 'lossy'
  | 'recent'
  | 'missing'
  | 'duplicates'
  | 'review';
