/**
 * SQLite schema for Spine-IQ history. Stores ONLY derived summaries and events —
 * never camera frames (see docs/PRIVACY.md). DDL is idempotent (IF NOT EXISTS)
 * so it doubles as the migration run on startup.
 */

export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS calibration_profiles (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     position_type TEXT NOT NULL,
     camera_device_id TEXT,
     baseline_features_json TEXT NOT NULL,
     feature_variance_json TEXT NOT NULL,
     camera_width INTEGER NOT NULL,
     camera_height INTEGER NOT NULL,
     confidence REAL NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS work_sessions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     started_at INTEGER NOT NULL,
     ended_at INTEGER,
     sitting_seconds INTEGER NOT NULL DEFAULT 0,
     standing_seconds INTEGER NOT NULL DEFAULT 0,
     away_seconds INTEGER NOT NULL DEFAULT 0,
     unknown_seconds INTEGER NOT NULL DEFAULT 0,
     good_posture_seconds INTEGER NOT NULL DEFAULT 0,
     poor_posture_seconds INTEGER NOT NULL DEFAULT 0,
     posture_notification_count INTEGER NOT NULL DEFAULT 0,
     position_notification_count INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS posture_events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     event_type TEXT NOT NULL,
     started_at INTEGER NOT NULL,
     resolved_at INTEGER,
     severity TEXT,
     posture_score REAL,
     position_state TEXT,
     notification_sent INTEGER NOT NULL DEFAULT 0,
     metadata_json TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS position_events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     previous_position TEXT NOT NULL,
     new_position TEXT NOT NULL,
     confidence REAL NOT NULL,
     source TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS places (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     descriptor_json TEXT,
     camera_device_id TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
];

/**
 * Statements applied AFTER the base schema, each tolerated to fail (SQLite has
 * no ALTER ... IF NOT EXISTS, so re-runs raise "duplicate column"). Order
 * matters: columns first, then the default place, then backfill.
 */
export const MIGRATION_STATEMENTS: readonly string[] = [
  "ALTER TABLE calibration_profiles ADD COLUMN place_id INTEGER",
  "ALTER TABLE work_sessions ADD COLUMN place_id INTEGER",
  `INSERT INTO places (id, name, descriptor_json, camera_device_id, created_at, updated_at)
   SELECT 1, 'My desk', NULL, NULL, 0, 0
   WHERE NOT EXISTS (SELECT 1 FROM places)`,
  "UPDATE calibration_profiles SET place_id = 1 WHERE place_id IS NULL",
  "UPDATE work_sessions SET place_id = 1 WHERE place_id IS NULL",
  // Purge rows written with the monotonic clock (pre-0.2.1 bug): their
  // timestamps are ms-since-app-launch, so no date query can ever match them.
  "DELETE FROM work_sessions WHERE started_at < 1000000000000",
  "DELETE FROM position_events WHERE created_at < 1000000000000",
];

/** Row shapes as returned by the DB (snake_case, matching the columns). */
export interface WorkSessionRow {
  id: number;
  started_at: number;
  ended_at: number | null;
  sitting_seconds: number;
  standing_seconds: number;
  away_seconds: number;
  unknown_seconds: number;
  good_posture_seconds: number;
  poor_posture_seconds: number;
  posture_notification_count: number;
  position_notification_count: number;
}

export interface PositionEventRow {
  id: number;
  previous_position: string;
  new_position: string;
  confidence: number;
  source: string;
  created_at: number;
}

export interface PlaceRow {
  id: number;
  name: string;
  descriptor_json: string | null;
  camera_device_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface CalibrationProfileRow {
  id: number;
  position_type: string;
  camera_device_id: string | null;
  baseline_features_json: string;
  feature_variance_json: string;
  camera_width: number;
  camera_height: number;
  confidence: number;
  created_at: number;
  updated_at: number;
}
