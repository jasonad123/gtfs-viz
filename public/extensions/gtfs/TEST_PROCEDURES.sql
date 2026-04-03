.print ''
.print '======================================================================'
.print 'GTFS EXTENSION LOAD TEST'
.print '======================================================================'
.print ''

.print 'Loading one-step GTFS install...'
.read public/extensions/gtfs/install_all.sql
.print '  ✓ GTFS install scripts loaded'
.print ''

.print 'Checking core functions/macros...'
SELECT function_name
FROM duckdb_functions()
WHERE function_name IN (
  'get_station_pathways',
  'get_station_stops',
  'get_pathways_filtered',
  'get_from_stops_available',
  'get_to_stops_available',
  'get_time_interval_ranges',
  'find_shortest_path',
  'find_reachable_stops',
  'get_station_routes'
)
ORDER BY function_name;
.print ''

.print '======================================================================'
.print 'If the rows above loaded, the GTFS extension tree is wired correctly.'
.print '======================================================================'
