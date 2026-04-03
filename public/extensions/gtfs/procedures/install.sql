-- ============================================================================
-- GTFS Procedures Install
-- ============================================================================
--
-- Loads the app-facing GTFS procedures from the unified gtfs extension folder.
-- Use this after loading the base GTFS install scripts.
--
-- Usage:
--   .read public/extensions/gtfs/procedures/install.sql
--
-- ============================================================================

.read public/extensions/gtfs/procedures/utils/gtfs_enums.sql

.read public/extensions/gtfs/procedures/tables/create_edit_stop_table.sql
.read public/extensions/gtfs/procedures/tables/create_edit_pathway_table.sql
.read public/extensions/gtfs/procedures/tables/create_stops_view.sql
.read public/extensions/gtfs/procedures/tables/create_pathways_view.sql
.read public/extensions/gtfs/procedures/tables/create_station_views.sql
.read public/extensions/gtfs/procedures/tables/create_stops_table.sql
.read public/extensions/gtfs/procedures/tables/create_stations_table.sql
.read public/extensions/gtfs/procedures/tables/initialize_pathway_network.sql

.read public/extensions/gtfs/procedures/queries/get_station_info.sql
.read public/extensions/gtfs/procedures/queries/get_station_stops.sql
.read public/extensions/gtfs/procedures/queries/get_station_pathways.sql
.read public/extensions/gtfs/procedures/queries/get_pathway_aggregates.sql
.read public/extensions/gtfs/procedures/queries/get_pathways_filtered.sql
.read public/extensions/gtfs/procedures/queries/get_time_interval_ranges.sql

.read public/extensions/gtfs/procedures/pathfinding/find_shortest_path.sql
.read public/extensions/gtfs/procedures/pathfinding/find_reachable_stops.sql
.read public/extensions/gtfs/procedures/pathfinding/find_all_paths.sql
.read public/extensions/gtfs/procedures/pathfinding/get_direct_pathways.sql
.read public/extensions/gtfs/procedures/pathfinding/get_station_routes.sql

SELECT 'GTFS procedures installed' AS status;
