

export const loadProcedure = async (conn: any, path: string): Promise<void> => {
  const response = await fetch(`/extensions/gtfs/procedures/${path}.sql`);
  if (!response.ok) {
    throw new Error(`Failed to load procedure: ${path} - HTTP ${response.status}`);
  }
  const sql = await response.text();

  const statements = sql
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => {
      
      if (!stmt || stmt.length === 0) return false;
      
      const lines = stmt.split('\n').filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('--');
      });
      return lines.length > 0;
    });

  for (const statement of statements) {
    await conn.query(statement);
  }
};

const loadProcedures = async (conn: any, paths: string[]): Promise<void> => {
  for (const path of paths) {
    await loadProcedure(conn, path);
  }
};

const PATHWAY_QUERY_PROCEDURE_PATHS = [
  "queries/get_station_stops",
  "queries/get_station_pathways",
  "queries/get_pathway_aggregates",
  "queries/get_pathways_filtered",
  "queries/get_time_interval_ranges",
];

export const createStationsTable = async (conn: any): Promise<void> => {
  await loadProcedure(conn, 'tables/create_stations_table');
};

export const createStopsTable = async (conn: any): Promise<void> => {
  await loadProcedure(conn, 'tables/create_stops_table');
};

export const createEditStopTable = async (conn: any): Promise<void> => {
  await loadProcedure(conn, 'tables/create_edit_stop_table');
};

export const createEditPathwayTable = async (conn: any): Promise<void> => {
  await loadProcedure(conn, 'tables/create_edit_pathway_table');
};

export const createStopsView = async (conn: any): Promise<void> => {
  await conn.query(`ALTER TABLE stops ADD COLUMN IF NOT EXISTS level_id VARCHAR`);
  await loadProcedure(conn, 'tables/create_stops_view');

  const { BASIC_QUERY_MACROS } = await import('./gtfs-ingestion/queries');
  await conn.query(BASIC_QUERY_MACROS);
};

export const createPathwaysView = async (conn: any): Promise<void> => {
  await loadProcedure(conn, 'tables/create_pathways_view');
};

export const loadPathwayQueryProcedures = async (conn: any): Promise<void> => {
  await loadProcedures(conn, PATHWAY_QUERY_PROCEDURE_PATHS);
};

const CREATE_PATHWAY_NETWORK_FROM_VIEWS = `
CREATE OR REPLACE VIEW pathway_network AS
SELECT
  p.*,

  COALESCE(NULLIF(s1.parent_station, ''), s1.stop_id) AS from_parent_station,
  s1.stop_lat AS from_lat,
  s1.stop_lon AS from_lon,
  s1.location_type_name AS from_location_type_name,

  COALESCE(NULLIF(s2.parent_station, ''), s2.stop_id) AS to_parent_station,
  s2.stop_lat AS to_lat,
  s2.stop_lon AS to_lon,
  s2.location_type_name AS to_location_type_name,

  CASE
    WHEN s1.stop_lat IS NOT NULL AND s1.stop_lon IS NOT NULL
         AND s2.stop_lat IS NOT NULL AND s2.stop_lon IS NOT NULL
    THEN DEGREES(
      ATAN2(
        s2.stop_lon - s1.stop_lon,
        s2.stop_lat - s1.stop_lat
      )
    )
    ELSE NULL
  END AS angle
FROM PathwaysView p
JOIN StopsView s1 ON p.from_stop_id = s1.stop_id
JOIN StopsView s2 ON p.to_stop_id = s2.stop_id
`;

export const recreatePathwayNetwork = async (conn: any): Promise<void> => {
  await conn.query('DROP VIEW IF EXISTS pathway_network');
  await conn.query(CREATE_PATHWAY_NETWORK_FROM_VIEWS);
};

export const reloadQueryMacros = async (conn: any): Promise<void> => {
  const { BASIC_QUERY_MACROS } = await import('./gtfs-ingestion/queries');
  await conn.query(BASIC_QUERY_MACROS);

  try {
    const result = await conn.query(`
      SELECT COUNT(*) as count
      FROM information_schema.views
      WHERE table_name = 'pathway_network'
    `);
    const count = result.toArray()[0]?.count || 0;
    if (Number(count) > 0) {
      await loadPathwayQueryProcedures(conn);
    }
  } catch (error) {
    console.warn('Could not check for pathway_network view:', error);
  }
};

export const recreateStopsView = async (conn: any): Promise<void> => {
  await conn.query(`ALTER TABLE stops ADD COLUMN IF NOT EXISTS level_id VARCHAR`);
  const { CREATE_STOPS_VIEW } = await import('./gtfs-ingestion/procedures');

  await conn.query('DROP VIEW IF EXISTS StopsView');

  await conn.query(CREATE_STOPS_VIEW);

  const { BASIC_QUERY_MACROS } = await import('./gtfs-ingestion/queries');
  await conn.query(BASIC_QUERY_MACROS);
};

export const recreatePathwaysView = async (conn: any): Promise<void> => {
  await conn.query('DROP VIEW IF EXISTS PathwaysView');
  await createPathwaysView(conn);
  await recreatePathwayNetwork(conn);

  try {
    await loadPathwayQueryProcedures(conn);
  } catch (error) {
    console.warn('Could not load pathway query procedures:', error);
  }
};
