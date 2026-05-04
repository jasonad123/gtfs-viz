# GTFS DuckDB Extension

DuckDB extension for GTFS transit data — station analysis, pathway navigation, and pathfinding.

Provides a TypeScript API used by the [CLI](../cli) and [web app](../web), with all SQL embedded from a single source (`src/include/gtfs_sql.hpp`).

## TypeScript API

```typescript
import {
  installExtension,   // Full install: macros + views + tables
  installMacros,      // Enum macros + edit tables only
  installInit,        // Views + TABLE macros + materialized tables
  importGtfs,         // Full import: macros + CSV import + init
  buildImportSql,     // Generate import SQL string
  sqlForNamedQuery,   // Generate SQL for named queries
} from "@gtfs-viz/duckdb-extension";
```

## Registered Macros

### Enum Helpers

| Macro | Description |
| --- | --- |
| `pathway_mode_to_name(mode)` | Pathway mode integer to name |
| `bidirectional_to_direction(bidir)` | Bidirectional flag to direction |
| `location_type_to_name(type, parent)` | Location type to name |
| `wheelchair_to_emoji(boarding)` | Wheelchair boarding to status |

### Query Macros

| Macro | Description |
| --- | --- |
| `get_station_info(id)` | Station details with pathway/exit counts |
| `get_station_stops(id)` | All stops belonging to a station |
| `get_station_pathways(id)` | Pathways for a station |
| `get_station_connections(id)` | Directed connections with times |
| `get_pathways_filtered(...)` | Pathways with filters |
| `get_station_routes(id)` | Shortest routes between all parts |

### Pathfinding Macros

| Macro | Description |
| --- | --- |
| `find_shortest_path(station, from, to)` | Shortest path between two stops |
| `find_reachable_stops(station, from)` | All reachable stops from a point |
| `find_all_paths(station, from, to)` | All paths between two stops |
| `get_direct_pathways(station)` | Direct connections with filters |

## Building

```bash
yarn build   # Generates dist/ from src/include/gtfs_sql.hpp
```
