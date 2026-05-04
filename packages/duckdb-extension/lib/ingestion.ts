/**
 * GTFS ingestion SQL generators.
 *
 * Generates SQL for importing and reformatting GTFS CSV files.
 * Used by both CLI (file paths) and web (registered file buffers).
 * Requires enum macros from GTFS_LOAD_SQL to be loaded first.
 */

import type { SqlExecutor } from "./installer.js";
import { installMacros, installInit } from "./installer.js";

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** SQL to drop existing GTFS tables/views before a fresh import. */
export function dropExistingSql(): string {
  return `
DROP TABLE IF EXISTS StopsTable;
DROP TABLE IF EXISTS StationsTable;
DROP VIEW IF EXISTS pathway_network;
DROP VIEW IF EXISTS PathwaysView;
DROP VIEW IF EXISTS StopsView;
DROP TABLE IF EXISTS stops;
DROP TABLE IF EXISTS pathways;
`;
}

/** SQL to import and reformat stops from a CSV source. */
export function importStopsSql(stopsPath: string): string {
  return `
CREATE TABLE stops AS SELECT * FROM read_csv_auto(${sqlString(stopsPath)}, null_padding=true, quote='"', ignore_errors=true);

ALTER TABLE stops ADD COLUMN IF NOT EXISTS parent_station VARCHAR;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS level_id VARCHAR;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS location_type INTEGER DEFAULT 0;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS wheelchair_boarding INTEGER DEFAULT 0;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS row_id INTEGER;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS location_type_name VARCHAR;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS wheelchair_status VARCHAR;

CREATE TEMP TABLE stops_temp AS SELECT * FROM stops;
DROP TABLE stops;

CREATE TABLE stops AS
WITH stops_with_casts AS (
  SELECT
    *,
    TRY_CAST(stop_id AS VARCHAR) AS stop_id_casted,
    TRY_CAST(parent_station AS VARCHAR) AS parent_station_casted,
    COALESCE(TRY_CAST(location_type AS INTEGER), 0) AS location_type_coalesced,
    COALESCE(TRY_CAST(wheelchair_boarding AS INTEGER), 0) AS wheelchair_boarding_coalesced
  FROM stops_temp
)
SELECT
  CAST(ROW_NUMBER() OVER () AS INTEGER) AS row_id,
  COALESCE(stop_id_casted, CAST(stop_id AS VARCHAR)) AS stop_id,
  stop_name,
  stop_lat,
  stop_lon,
  COALESCE(parent_station_casted, TRY_CAST(parent_station AS VARCHAR)) AS parent_station,
  location_type_coalesced AS location_type,
  wheelchair_boarding_coalesced AS wheelchair_boarding,
  * EXCLUDE (
    row_id, stop_id, stop_name, stop_lat, stop_lon,
    parent_station, location_type, wheelchair_boarding,
    location_type_name, wheelchair_status,
    stop_id_casted, parent_station_casted,
    location_type_coalesced, wheelchair_boarding_coalesced
  ),
  location_type_to_name(location_type_coalesced, COALESCE(parent_station_casted, TRY_CAST(parent_station AS VARCHAR))) AS location_type_name,
  wheelchair_to_emoji(wheelchair_boarding_coalesced) AS wheelchair_status
FROM stops_with_casts;

DROP TABLE IF EXISTS stops_temp;
`;
}

/** SQL to import and reformat pathways from a CSV source. */
export function importPathwaysSql(pathwaysPath: string): string {
  return `
CREATE TABLE pathways AS SELECT * FROM read_csv_auto(${sqlString(pathwaysPath)}, null_padding=true, quote='"', ignore_errors=true);

ALTER TABLE pathways ADD COLUMN IF NOT EXISTS pathway_mode INTEGER DEFAULT 1;
ALTER TABLE pathways ADD COLUMN IF NOT EXISTS is_bidirectional INTEGER DEFAULT 1;
ALTER TABLE pathways ADD COLUMN IF NOT EXISTS length DOUBLE;
ALTER TABLE pathways ADD COLUMN IF NOT EXISTS traversal_time INTEGER;
ALTER TABLE pathways ADD COLUMN IF NOT EXISTS stair_count INTEGER;
ALTER TABLE pathways ADD COLUMN IF NOT EXISTS max_slope DOUBLE;
ALTER TABLE pathways ADD COLUMN IF NOT EXISTS min_width DOUBLE;
ALTER TABLE pathways ADD COLUMN IF NOT EXISTS signposted_as VARCHAR;
ALTER TABLE pathways ADD COLUMN IF NOT EXISTS reversed_signposted_as VARCHAR;
ALTER TABLE pathways ADD COLUMN IF NOT EXISTS row_id INTEGER;
ALTER TABLE pathways ADD COLUMN IF NOT EXISTS pathway_mode_name VARCHAR;
ALTER TABLE pathways ADD COLUMN IF NOT EXISTS direction_type VARCHAR;

CREATE TEMP TABLE pathways_temp AS SELECT * FROM pathways;
DROP TABLE pathways;

CREATE TABLE pathways AS
WITH pathways_with_casts AS (
  SELECT
    *,
    TRY_CAST(pathway_id AS VARCHAR) AS pathway_id_casted,
    TRY_CAST(from_stop_id AS VARCHAR) AS from_stop_id_casted,
    TRY_CAST(to_stop_id AS VARCHAR) AS to_stop_id_casted,
    COALESCE(TRY_CAST(pathway_mode AS INTEGER), 1) AS pathway_mode_coalesced,
    COALESCE(TRY_CAST(is_bidirectional AS INTEGER), 1) AS is_bidirectional_coalesced
  FROM pathways_temp
)
SELECT
  CAST(ROW_NUMBER() OVER () AS INTEGER) AS row_id,
  COALESCE(pathway_id_casted, CAST(pathway_id AS VARCHAR)) AS pathway_id,
  COALESCE(from_stop_id_casted, CAST(from_stop_id AS VARCHAR)) AS from_stop_id,
  COALESCE(to_stop_id_casted, CAST(to_stop_id AS VARCHAR)) AS to_stop_id,
  pathway_mode_coalesced AS pathway_mode,
  is_bidirectional_coalesced AS is_bidirectional,
  * EXCLUDE (
    row_id, pathway_id, from_stop_id, to_stop_id,
    pathway_mode, is_bidirectional, pathway_mode_name, direction_type,
    pathway_id_casted, from_stop_id_casted, to_stop_id_casted,
    pathway_mode_coalesced, is_bidirectional_coalesced
  ),
  pathway_mode_to_name(pathway_mode_coalesced) AS pathway_mode_name,
  bidirectional_to_direction(is_bidirectional_coalesced) AS direction_type
FROM pathways_with_casts;

DROP TABLE IF EXISTS pathways_temp;
`;
}

/** SQL to create an empty pathways table (when no pathways.txt exists). */
export function emptyPathwaysSql(): string {
  return `
CREATE TABLE IF NOT EXISTS pathways (
  row_id INTEGER, pathway_id VARCHAR,
  from_stop_id VARCHAR, to_stop_id VARCHAR,
  pathway_mode INTEGER, is_bidirectional INTEGER,
  length DOUBLE, traversal_time INTEGER, stair_count INTEGER,
  max_slope DOUBLE, min_width DOUBLE,
  signposted_as VARCHAR, reversed_signposted_as VARCHAR,
  pathway_mode_name VARCHAR, direction_type VARCHAR
);
`;
}

/**
 * Build the full import SQL: macros → drop → CSV import → extension init.
 * Used by CLI to pipe to DuckDB as a single SQL file.
 */
export function buildImportSql(opts: {
  stopsPath: string;
  pathwaysPath?: string;
}): string {
  return [
    "-- GTFS Extension: import + install",
    importStopsSql(opts.stopsPath),
    opts.pathwaysPath
      ? importPathwaysSql(opts.pathwaysPath)
      : emptyPathwaysSql(),
  ].join("\n");
}

/**
 * Run full GTFS import via executor: macros → drop → import → init.
 * Used by web to run through DuckDB WASM connection.
 */
export async function importGtfs(
  executor: SqlExecutor,
  opts: {
    stopsPath: string;
    pathwaysPath?: string;
    skipDrop?: boolean;
  },
): Promise<void> {
  // 1. Install enum macros + edit tables
  await installMacros(executor);

  // 2. Drop existing views/tables
  if (!opts.skipDrop) {
    const dropStmts = dropExistingSql()
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of dropStmts) {
      await executor(stmt);
    }
  }

  // 3. Import and reformat CSV data
  const importSql = buildImportSql(opts);
  const stmts = importSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => {
      if (!s || s.length === 0) return false;
      const lines = s.split("\n").filter((l) => {
        const t = l.trim();
        return t.length > 0 && !t.startsWith("--");
      });
      return lines.length > 0;
    });
  for (const stmt of stmts) {
    await executor(stmt);
  }

  // 4. Install extension: views, macros, tables, indexes
  await installInit(executor);
}
