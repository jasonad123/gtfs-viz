import { executeQuery } from "@/lib/duckdb/QueryHelper";
import { logger } from "@/lib/logger";
import { getPathfindingFunctions } from "./pathways/hybridPathfinding";

export const fetchRouteData = async (props) => {
  const { conn, StationView } = props;

  try {
    logger.log(`🔍 Fetching route data for station ${StationView.stop_id}`);

    const functions = await getPathfindingFunctions(conn);

    let query: string;
    if (functions.method === "onager_direct") {
      query = `SELECT * FROM get_station_routes_direct('${StationView.stop_id}')`;
      logger.log(`  Using Onager direct mode (all-pairs Dijkstra)`);
    } else {
      query = `SELECT * FROM get_station_routes('${StationView.stop_id}')`;
      logger.log(`  Using recursive CTE mode (with cache)`);
    }

    const results = await executeQuery(conn, query);

    logger.log(`  ✅ Found ${results.length} routes for station ${StationView.stop_id}`);

    return results;
  } catch (error) {
    logger.error("Error executing RouteDataQuery:", error);
    throw error;
  }
};

const escapeSql = (value: string) => value.replace(/'/g, "''");

const routeIdListSql = (routeIds: string[]) => {
  return `[${routeIds.map((id) => `'${escapeSql(id)}'`).join(", ")}]`;
};

export const fetchServiceRoutesData = async (conn: any) => {
  return executeQuery(conn, "SELECT * FROM RoutesTable");
};

export const fetchServiceRouteInfoData = async (conn: any, routeId: string) => {
  return (
    await executeQuery(conn, `SELECT * FROM RoutesTable WHERE route_id = '${escapeSql(routeId)}'`)
  )[0];
};

export const fetchServiceRouteTripsData = async (conn: any, routeId: string) => {
  return executeQuery(
    conn,
    `
      SELECT route_id, service_id, trip_id, trip_headsign, trip_short_name,
             direction_id, block_id, shape_id, wheelchair_accessible, bikes_allowed
      FROM TripsView
      WHERE route_id = '${escapeSql(routeId)}'
      ORDER BY trip_id
    `,
  );
};

const ensureServiceTables = async (conn: any) => {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS calendar (
      row_id INTEGER, service_id VARCHAR, monday INTEGER, tuesday INTEGER,
      wednesday INTEGER, thursday INTEGER, friday INTEGER, saturday INTEGER,
      sunday INTEGER, start_date VARCHAR, end_date VARCHAR
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS calendar_dates (
      row_id INTEGER, service_id VARCHAR, date VARCHAR, exception_type INTEGER
    )
  `);
};

export const fetchServiceRouteServicesData = async (conn: any, routeId: string) => {
  await ensureServiceTables(conn);
  return executeQuery(
    conn,
    `
      WITH route_services AS (
        SELECT route_id, service_id, COUNT(DISTINCT trip_id) AS trip_count,
               COUNT(DISTINCT shape_id) AS shape_count,
               COUNT(DISTINCT block_id) AS block_count,
               COUNT(DISTINCT trip_headsign) AS headsign_count
        FROM TripsView
        WHERE route_id = '${escapeSql(routeId)}'
          AND service_id IS NOT NULL AND service_id != ''
        GROUP BY route_id, service_id
      ),
      date_summary AS (
        SELECT service_id,
               SUM(CASE WHEN exception_type = 1 THEN 1 ELSE 0 END) AS added_dates,
               SUM(CASE WHEN exception_type = 2 THEN 1 ELSE 0 END) AS removed_dates,
               MIN(date) AS first_exception_date,
               MAX(date) AS last_exception_date,
               STRING_AGG(date, ',') FILTER (WHERE exception_type = 1) AS added_exception_dates,
               STRING_AGG(date, ',') FILTER (WHERE exception_type = 2) AS removed_exception_dates
        FROM calendar_dates
        GROUP BY service_id
      )
      SELECT rs.route_id, rs.service_id, rs.trip_count, rs.shape_count,
             rs.block_count, rs.headsign_count,
             COALESCE(c.monday, 0) AS monday,
             COALESCE(c.tuesday, 0) AS tuesday,
             COALESCE(c.wednesday, 0) AS wednesday,
             COALESCE(c.thursday, 0) AS thursday,
             COALESCE(c.friday, 0) AS friday,
             COALESCE(c.saturday, 0) AS saturday,
             COALESCE(c.sunday, 0) AS sunday,
             c.start_date, c.end_date,
             COALESCE(ds.added_dates, 0) AS added_dates,
             COALESCE(ds.removed_dates, 0) AS removed_dates,
             ds.first_exception_date,
             ds.last_exception_date,
             ds.added_exception_dates,
             ds.removed_exception_dates
      FROM route_services rs
      LEFT JOIN calendar c ON c.service_id = rs.service_id
      LEFT JOIN date_summary ds ON ds.service_id = rs.service_id
      ORDER BY rs.service_id
    `,
  );
};

export const fetchServiceRouteTripsForServiceData = async (
  conn: any,
  routeId: string,
  serviceId: string,
) => {
  return executeQuery(
    conn,
    `
      WITH parsed_stop_times AS (
        SELECT trip_id,
               NULLIF(arrival_time, '') AS arrival_time,
               NULLIF(departure_time, '') AS departure_time,
               CASE
                 WHEN NULLIF(departure_time, '') IS NULL THEN NULL
                 ELSE COALESCE(TRY_CAST(SPLIT_PART(departure_time, ':', 1) AS INTEGER), 0) * 3600
                    + COALESCE(TRY_CAST(SPLIT_PART(departure_time, ':', 2) AS INTEGER), 0) * 60
                    + COALESCE(TRY_CAST(SPLIT_PART(departure_time, ':', 3) AS INTEGER), 0)
               END AS departure_seconds,
               CASE
                 WHEN NULLIF(arrival_time, '') IS NULL THEN NULL
                 ELSE COALESCE(TRY_CAST(SPLIT_PART(arrival_time, ':', 1) AS INTEGER), 0) * 3600
                    + COALESCE(TRY_CAST(SPLIT_PART(arrival_time, ':', 2) AS INTEGER), 0) * 60
                    + COALESCE(TRY_CAST(SPLIT_PART(arrival_time, ':', 3) AS INTEGER), 0)
               END AS arrival_seconds
        FROM stop_times
        WHERE trip_id IS NOT NULL AND trip_id != ''
      ),
      trip_times AS (
        SELECT trip_id,
               MIN(departure_time) AS first_departure_time,
               MAX(arrival_time) AS last_arrival_time,
               MIN(departure_seconds) AS first_departure_seconds,
               MAX(arrival_seconds) AS last_arrival_seconds
        FROM parsed_stop_times
        GROUP BY trip_id
      )
      SELECT t.route_id, t.service_id, t.trip_id, t.trip_headsign, t.trip_short_name,
             t.direction_id, t.block_id, t.shape_id, t.wheelchair_accessible, t.bikes_allowed,
             tt.first_departure_time, tt.last_arrival_time,
             tt.first_departure_seconds, tt.last_arrival_seconds
      FROM TripsView t
      LEFT JOIN trip_times tt ON tt.trip_id = t.trip_id
      WHERE t.route_id = '${escapeSql(routeId)}'
        AND t.service_id = '${escapeSql(serviceId)}'
      ORDER BY COALESCE(tt.first_departure_seconds, 2147483647), t.trip_id
    `,
  );
};

export const fetchServiceTripStopTimesData = async (conn: any, tripId: string) => {
  return executeQuery(
    conn,
    `
      SELECT st.trip_id, st.stop_sequence, st.arrival_time, st.departure_time,
             st.stop_id, sv.stop_name, sv.location_type_name, sv.parent_station,
             COALESCE(station.stop_name, sv.stop_name) AS station_name,
             st.stop_headsign, st.pickup_type, st.drop_off_type, st.shape_dist_traveled,
             sv.stop_lat, sv.stop_lon
      FROM stop_times st
      LEFT JOIN StopsView sv ON sv.stop_id = st.stop_id
      LEFT JOIN StopsView station
        ON station.stop_id = COALESCE(NULLIF(sv.parent_station, ''), sv.stop_id)
       AND station.location_type_name = 'Station'
      WHERE st.trip_id = '${escapeSql(tripId)}'
      ORDER BY st.stop_sequence, st.arrival_time, st.departure_time, st.stop_id
    `,
  );
};

export const fetchServiceRouteStationsData = async (conn: any, routeId: string) => {
  return executeQuery(conn, `SELECT * FROM get_route_stations('${escapeSql(routeId)}')`);
};

export const fetchServiceRouteStopsData = async (conn: any, routeIds: string[]) => {
  if (routeIds.length === 0) return [];
  if (routeIds.length > 25) {
    return executeQuery(
      conn,
      "SELECT * FROM RouteStopsTable ORDER BY route_id, stop_sequence, stop_name, stop_id",
    );
  }
  return executeQuery(
    conn,
    `SELECT * FROM get_route_stops_for_routes(${routeIdListSql(routeIds)})`,
  );
};

const boundsRowToFit = (rawRow: any) => {
  const row = rawRow?.toJSON?.() ?? rawRow;
  if (!row || row.min_lon == null) return null;
  const minLon = Number(row.min_lon);
  const maxLon = Number(row.max_lon);
  const minLat = Number(row.min_lat);
  const maxLat = Number(row.max_lat);
  const centerLon = Number(row.center_lon);
  const centerLat = Number(row.center_lat);
  const zoom = Number(row.zoom);
  if (
    !Number.isFinite(minLon) || !Number.isFinite(maxLon) ||
    !Number.isFinite(minLat) || !Number.isFinite(maxLat) ||
    !Number.isFinite(centerLon) || !Number.isFinite(centerLat) ||
    !Number.isFinite(zoom)
  ) return null;
  return {
    boundBox: [[minLon, minLat], [maxLon, maxLat]] as [[number, number], [number, number]],
    viewState: {
      longitude: centerLon,
      latitude: centerLat,
      zoom,
      pitch: 0,
      bearing: 0,
      transitionDuration: 0,
    },
  };
};

export const fetchStationsMapBounds = async (conn: any) => {
  const rows = await executeQuery(conn, "SELECT * FROM get_stations_map_bounds()");
  return boundsRowToFit(rows[0]);
};

export const fetchStopsMapBounds = async (conn: any) => {
  const rows = await executeQuery(conn, "SELECT * FROM get_stops_map_bounds()");
  return boundsRowToFit(rows[0]);
};

export const fetchRouteMapBounds = async (conn: any, routeIds: string[]) => {
  if (routeIds.length === 0) return null;
  if (routeIds.length > 200) {
    const rows = await executeQuery(conn, "SELECT * FROM get_all_shapes_map_bounds()");
    return boundsRowToFit(rows[0]);
  }
  const rows = await executeQuery(
    conn,
    `SELECT * FROM get_route_map_bounds(${routeIdListSql(routeIds)})`,
  );
  return boundsRowToFit(rows[0]);
};

export const fetchServiceRouteShapesData = async (
  conn: any,
  routeIds: string[],
  options?: { routeTypes?: string[] },
) => {
  if (routeIds.length === 0) return [];

  const isLargeSet = routeIds.length > 200;
  const maxPointsPerShape = isLargeSet ? 30 : routeIds.length > 10 ? 80 : 240;

  // For large sets, skip route ID list and filter by route type in SQL
  let routeShapesCte: string;
  if (isLargeSet) {
    const typeFilter = options?.routeTypes && options.routeTypes.length > 0
      ? `AND r.route_type_name IN (${options.routeTypes.map((t) => `'${escapeSql(t)}'`).join(", ")})`
      : "";
    routeShapesCte = `
      all_route_shapes AS (
        SELECT t.route_id, t.shape_id, COUNT(*) as pt_count,
               ROW_NUMBER() OVER (PARTITION BY t.route_id ORDER BY COUNT(*) DESC) as rn
        FROM (
          SELECT DISTINCT tv.route_id, tv.shape_id
          FROM TripsView tv
          JOIN RoutesView r ON r.route_id = tv.route_id
          WHERE tv.shape_id IS NOT NULL AND tv.shape_id != '' ${typeFilter}
        ) t
        JOIN shapes s ON s.shape_id = t.shape_id
        GROUP BY t.route_id, t.shape_id
      ),
      route_shapes AS (
        SELECT route_id, shape_id FROM all_route_shapes WHERE rn = 1
      )`;
  } else {
    routeShapesCte = `
      requested_routes AS (
        SELECT unnest(${routeIdListSql(routeIds)}) AS route_id
      ),
      route_shapes AS (
        SELECT DISTINCT t.route_id, t.shape_id
        FROM TripsView t
        JOIN requested_routes rr ON rr.route_id = t.route_id
        WHERE t.shape_id IS NOT NULL AND t.shape_id != ''
      )`;
  }

  return executeQuery(
    conn,
    `
      WITH ${routeShapesCte},
      shape_points AS (
        SELECT rs.route_id, r.route_name, r.route_color_hex, r.route_text_color_hex,
               r.route_type_name, rs.shape_id, s.shape_pt_lat, s.shape_pt_lon,
               s.shape_pt_sequence, s.shape_dist_traveled,
               ROW_NUMBER() OVER (
                 PARTITION BY rs.route_id, rs.shape_id
                 ORDER BY s.shape_pt_sequence
               ) AS point_index,
               COUNT(*) OVER (PARTITION BY rs.route_id, rs.shape_id) AS point_count
        FROM route_shapes rs
        JOIN RoutesView r ON r.route_id = rs.route_id
        JOIN shapes s ON s.shape_id = rs.shape_id
        WHERE s.shape_pt_lat IS NOT NULL AND s.shape_pt_lon IS NOT NULL
      )
      SELECT route_id, route_name, route_color_hex, route_text_color_hex,
             route_type_name, shape_id, shape_pt_lat, shape_pt_lon,
             shape_pt_sequence, shape_dist_traveled
      FROM shape_points
      WHERE point_count <= ${maxPointsPerShape}
         OR point_index = 1
         OR point_index = point_count
         OR ((point_index - 1) % GREATEST(1, CAST(CEIL(point_count / ${maxPointsPerShape}.0) AS INTEGER))) = 0
      ORDER BY route_id, shape_id, shape_pt_sequence
    `,
  );
};
