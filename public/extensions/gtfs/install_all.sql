-- ============================================================================
-- GTFS Full Install
-- ============================================================================
--
-- One-step installation for the unified GTFS extension.
--
-- Usage:
--   .read public/extensions/gtfs/install_all.sql
--
-- ============================================================================

.read public/extensions/gtfs/install.sql
.read public/extensions/gtfs/install_pathways.sql
.read public/extensions/gtfs/procedures/install.sql

SELECT 'GTFS extension fully installed' AS status;
