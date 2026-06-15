import React, { createContext, useState, useContext, ReactNode, FC, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import DuckDB from "./duckdbConfig";
import { DuckDBContextType } from "@/types/objectTypes";
import { logger } from "@/lib/logger";
import { resetProceduresFlag } from "@/lib/duckdb/DataFetching/pathways/fetchStationPathways";
import { resetStationInfoProceduresFlag } from "@/lib/duckdb/DataFetching/fetchStationInfoData";
import {
  createCliNativeConnection,
  fetchCliNativeDataset,
  getCliNativeLaunchProfile,
} from "@/lib/cli/nativeDuckDb";
import { clearGTFSAvailabilityStorage, fetchGTFSDataAvailability } from "@/lib/gtfs-ingestion";

const DuckDBContext = createContext<DuckDBContextType | null>(null);

const SESSION_KEY = "duckdb_session_active";
const IMPORT_QUERY_KEYS = new Set(["fetchUploadData", "createFormatedTables"]);

export const DuckDBProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cliProfile] = useState(() => getCliNativeLaunchProfile());
  const [dbInstance, setDbInstance] = useState<any>(null);
  const [connInstance, setConnInstance] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [initialized, setInitialized] = useState<boolean>(() => {
    return (
      Boolean(getCliNativeLaunchProfile()) ||
      localStorage.getItem("gtfs_data_initialized") === "true"
    );
  });

  const [hasStations, setHasStations] = useState<boolean>(() => {
    return (
      Boolean(getCliNativeLaunchProfile()) || localStorage.getItem("gtfs_has_stations") === "true"
    );
  });

  const [hasStops, setHasStops] = useState<boolean>(() => {
    return (
      Boolean(getCliNativeLaunchProfile()) || localStorage.getItem("gtfs_has_stops") === "true"
    );
  });

  const [hasRoutes, setHasRoutes] = useState<boolean>(() => {
    return (
      Boolean(getCliNativeLaunchProfile()) || localStorage.getItem("gtfs_has_routes") === "true"
    );
  });

  const [hasTrips, setHasTrips] = useState<boolean>(() => Boolean(getCliNativeLaunchProfile()) || localStorage.getItem("gtfs_has_trips") === "true");
  const [hasStopTimes, setHasStopTimes] = useState<boolean>(() => Boolean(getCliNativeLaunchProfile()) || localStorage.getItem("gtfs_has_stop_times") === "true");
  const [hasShapes, setHasShapes] = useState<boolean>(() => Boolean(getCliNativeLaunchProfile()) || localStorage.getItem("gtfs_has_shapes") === "true");
  const [hasCalendar, setHasCalendar] = useState<boolean>(() => Boolean(getCliNativeLaunchProfile()) || localStorage.getItem("gtfs_has_calendar") === "true");

  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [loadingSubMessage, setLoadingSubMessage] = useState<string>("");

  const initializeDuckDB = async () => {
    setLoading(true);
    if (cliProfile) {
      const dataset = await fetchCliNativeDataset(cliProfile);
      setConnInstance(createCliNativeConnection(cliProfile));
      setDbInstance({ __gtfsVizCliNative: true });
      setInitialized(dataset.status === "ready");
      setHasStations(Number(dataset.counts?.stations || 0) > 0);
      setHasStops(Number(dataset.counts?.stops || 0) > 0);
      setHasRoutes(Number(dataset.counts?.routes || 0) > 0);
      setLoading(false);
      return;
    }
    const { conn, db } = await DuckDB();
    setConnInstance(conn);
    setDbInstance(db);
    setLoading(false);
  };

  useEffect(() => {
    if (cliProfile) {
      sessionStorage.setItem(SESSION_KEY, "true");
      return;
    }

    const currentPath = window.location.pathname;
    const isHomePage = currentPath === "/";
    const isHardRefresh = !sessionStorage.getItem(SESSION_KEY);

    if (isHomePage || isHardRefresh) {
      const performReset = async () => {
        logger.log("🔄 Clearing database - fresh start");

        clearGTFSAvailabilityStorage();

        resetProceduresFlag();
        resetStationInfoProceduresFlag();

        queryClient.clear();
        logger.log("  ✅ Cleared React Query cache");

        if (typeof indexedDB !== "undefined") {
          try {
            indexedDB.deleteDatabase("duckdb");
            logger.log("  ✅ Cleared DuckDB IndexedDB");
          } catch {
            logger.log("  ℹ️  No IndexedDB to clear");
          }
        }

        setInitialized(false);
        setHasStations(false);
        setHasStops(false);
        setHasRoutes(false);
        setHasTrips(false);
        setHasStopTimes(false);
        setHasShapes(false);
        setHasCalendar(false);

        if (connInstance) {
          try {
            await connInstance.close();
            logger.log("  ✅ Closed database connection");
          } catch {
            logger.log("  ⚠️  Connection already closed");
          }
        }

        if (dbInstance) {
          try {
            await dbInstance.terminate();
            logger.log("  ✅ Terminated database instance");
          } catch {
            logger.log("  ⚠️  Database already terminated");
          }
        }

        setDbInstance(null);
        setConnInstance(null);

        logger.log("  🔄 Reinitializing empty database...");
        await initializeDuckDB();

        if (isHardRefresh && !isHomePage) {
          navigate({ to: "/" }).catch(() => {});
        }

        logger.log("✅ Database reset complete - ready for import");
      };

      performReset();
    }

    sessionStorage.setItem(SESSION_KEY, "true");
  }, [navigate, queryClient, cliProfile]);

  useEffect(() => {
    initializeDuckDB();
  }, []);

  useEffect(() => {
    if (cliProfile) return;
    if (!connInstance) return;

    const checkAndResetIfNeeded = async () => {
      const localStorageInitialized = localStorage.getItem("gtfs_data_initialized") === "true";
      if (!localStorageInitialized) return;

      try {
        await connInstance.query(`SELECT COUNT(*) FROM StationsTable LIMIT 1`);
      } catch (error) {
        const errorMsg = error?.message || String(error);
        if (errorMsg.includes("does not exist")) {
          logger.log("🔄 Data missing after refresh - resetting state...");

          setInitialized(false);
          setHasStations(false);
          setHasStops(false);
          setHasRoutes(false);

          resetProceduresFlag();
          resetStationInfoProceduresFlag();

          queryClient.clear();
          logger.log("  ✅ Cleared React Query cache");

          clearGTFSAvailabilityStorage();

          navigate({ to: "/" }).catch(() => {});

          logger.log("✅ State reset - please import data");
        }
      }
    };

    checkAndResetIfNeeded();
  }, [connInstance, navigate, cliProfile]);

  useEffect(() => {
    if (!connInstance || !initialized) return;

    let isCancelled = false;

    const checkDataAvailability = async () => {
      if (isCancelled || !connInstance || !initialized) return;

      try {
        const availability = await fetchGTFSDataAvailability(connInstance);
        if (isCancelled) return;

        setHasStations((prev) => {
          if (prev !== availability.hasStations) {
            logger.log("Stations availability changed:", availability.hasStations);
            return availability.hasStations;
          }
          return prev;
        });

        setHasStops((prev) => {
          if (prev !== availability.hasStops) {
            logger.log("Stops availability changed:", availability.hasStops);
            return availability.hasStops;
          }
          return prev;
        });

        setHasRoutes((prev) => {
          if (prev !== availability.hasRoutes) {
            logger.log("Routes availability changed:", availability.hasRoutes);
            return availability.hasRoutes;
          }
          return prev;
        });
        setHasTrips(availability.hasTrips);
        setHasStopTimes(availability.hasStopTimes);
        setHasShapes(availability.hasShapes);
        setHasCalendar(availability.hasCalendar);
      } catch (error) {
        if (isCancelled || !initialized) return;

        const errorMsg = error?.message || String(error);

        if (errorMsg.includes("does not exist")) {
          logger.log("⚠️ Tables missing but data flagged as initialized - resetting...");

          setInitialized(false);
          setHasStations(false);
          setHasStops(false);
          setHasRoutes(false);

          resetProceduresFlag();
          resetStationInfoProceduresFlag();

          queryClient.clear();
          logger.log("  ✅ Cleared React Query cache");

          clearGTFSAvailabilityStorage();

          if (!cliProfile) {
            navigate({ to: "/" }).catch(() => {});
          }

          logger.log("✅ Reset complete - navigate to home to import data");
        } else {
          logger.error("Error checking data availability:", error);
        }
      }
    };

    checkDataAvailability();
    const intervalId = setInterval(checkDataAvailability, 2000);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [connInstance, initialized, cliProfile]);

  useEffect(() => {
    if (initialized) {
      localStorage.setItem("gtfs_data_initialized", "true");

      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key !== "string" || !IMPORT_QUERY_KEYS.has(key);
        },
      });
      logger.log("  ✅ Invalidated all queries after initialization");
    } else {
      localStorage.removeItem("gtfs_data_initialized");
    }
  }, [initialized, queryClient]);

  useEffect(() => {
    if (hasStations) {
      localStorage.setItem("gtfs_has_stations", "true");
    } else {
      localStorage.removeItem("gtfs_has_stations");
    }
  }, [hasStations]);

  useEffect(() => {
    if (hasStops) {
      localStorage.setItem("gtfs_has_stops", "true");
    } else {
      localStorage.removeItem("gtfs_has_stops");
    }
  }, [hasStops]);

  useEffect(() => {
    if (hasRoutes) {
      localStorage.setItem("gtfs_has_routes", "true");
    } else {
      localStorage.removeItem("gtfs_has_routes");
    }
  }, [hasRoutes]);

  const refreshDataAvailability = async () => {
    if (!connInstance) return;

    try {
      const availability = await fetchGTFSDataAvailability(connInstance);

      logger.log("Refreshed data availability:", availability);

      setHasStations(availability.hasStations);
      setHasStops(availability.hasStops);
      setHasRoutes(availability.hasRoutes);
      setHasTrips(availability.hasTrips);
      setHasStopTimes(availability.hasStopTimes);
      setHasShapes(availability.hasShapes);
      setHasCalendar(availability.hasCalendar);
    } catch (error) {
      const errorMsg = error?.message || String(error);
      if (!errorMsg.includes("does not exist")) {
        logger.error("Error refreshing data availability:", error);
      }
    }
  };

  const resetDb = async () => {
    if (cliProfile) {
      queryClient.clear();
      await initializeDuckDB();
      return;
    }

    logger.log("🔄 Resetting DuckDB instance...");

    setInitialized(false);
    setHasStations(false);
    setHasStops(false);
    setHasRoutes(false);

    resetProceduresFlag();
    resetStationInfoProceduresFlag();

    queryClient.clear();
    logger.log("  ✅ Cleared React Query cache");

    await new Promise((resolve) => setTimeout(resolve, 50));

    if (connInstance) {
      try {
        await connInstance.close();
        logger.log("  ✅ Closed database connection");
      } catch {
        logger.log("  ⚠️  Connection already closed");
      }
    }

    if (dbInstance) {
      try {
        await dbInstance.terminate();
        logger.log("  ✅ Terminated database instance");
      } catch {
        logger.log("  ⚠️ Database already terminated");
      }
    }

    setDbInstance(null);
    setConnInstance(null);
    clearGTFSAvailabilityStorage();

    await new Promise((resolve) => setTimeout(resolve, 100));

    logger.log("  🔄 Creating fresh DuckDB instance...");
    await initializeDuckDB();
    logger.log("✅ Database reset complete - ready for new data");
  };

  return (
    <DuckDBContext.Provider
      value={{
        db: dbInstance,
        conn: connInstance,
        loading,
        isCliLaunch: Boolean(cliProfile),
        initialized,
        setInitialized,
        hasStations,
        setHasStations,
        hasStops,
        setHasStops,
        hasRoutes,
        setHasRoutes,
        hasTrips,
        hasStopTimes,
        hasShapes,
        hasCalendar,
        refreshDataAvailability,
        resetDb,
        isResetting,
        setIsResetting,
        loadingMessage,
        setLoadingMessage,
        loadingSubMessage,
        setLoadingSubMessage,
      }}
    >
      {children}
    </DuckDBContext.Provider>
  );
};

export const useDuckDB = (): DuckDBContextType | null => {
  return useContext(DuckDBContext);
};
