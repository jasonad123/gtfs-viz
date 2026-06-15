import { useEffect, useMemo, useRef, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import TableComponent from "@/components/table";
import Combobox from "@/components/ui/combobox";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { BiGitCompare, BiPlus, BiX } from "react-icons/bi";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDuckDB } from "@/context/duckdb.client";
import {
  fetchServiceRouteTripsForServiceData,
  fetchServiceTripStopTimesData,
} from "@/lib/duckdb/DataFetching/fetchRouteData";

type RouteServiceRow = {
  route_id: string;
  service_id: string;
  trip_count?: number;
  shape_count?: number;
  block_count?: number;
  headsign_count?: number;
  monday?: number;
  tuesday?: number;
  wednesday?: number;
  thursday?: number;
  friday?: number;
  saturday?: number;
  sunday?: number;
  start_date?: string;
  end_date?: string;
  added_dates?: number;
  removed_dates?: number;
  first_exception_date?: string;
  last_exception_date?: string;
  added_exception_dates?: string;
  removed_exception_dates?: string;
  service_days?: string;
};

type RouteTrip = {
  route_id: string;
  service_id?: string;
  trip_id: string;
  trip_headsign?: string;
  trip_short_name?: string;
  direction_id?: number;
  block_id?: string;
  shape_id?: string;
  wheelchair_accessible?: number;
  bikes_allowed?: number;
  first_departure_time?: string;
  last_arrival_time?: string;
  first_departure_seconds?: number;
  last_arrival_seconds?: number;
};

type TripStopTime = {
  trip_id: string;
  stop_sequence?: number;
  arrival_time?: string;
  departure_time?: string;
  stop_id?: string;
  stop_name?: string;
  station_name?: string;
  location_type_name?: string;
  stop_headsign?: string;
  pickup_type?: number;
  drop_off_type?: number;
};

const dayLabels = [
  ["monday", "Mon"],
  ["tuesday", "Tue"],
  ["wednesday", "Wed"],
  ["thursday", "Thu"],
  ["friday", "Fri"],
  ["saturday", "Sat"],
  ["sunday", "Sun"],
] as const;

const normalizeGtfsDate = (value?: string) =>
  String(value || "").replace(/-/g, "").trim();

const serviceDays = (service: RouteServiceRow) => {
  const days = dayLabels
    .filter(([key]) => Number(service[key] || 0) === 1)
    .map(([, label]) => label);
  return days.length > 0 ? days.join(", ") : "Dates only";
};

const gtfsDateToDay = (dateStr?: string) => {
  const normalized = normalizeGtfsDate(dateStr);
  if (!normalized || normalized.length !== 8) return undefined;
  const y = parseInt(normalized.substring(0, 4));
  const m = parseInt(normalized.substring(4, 6)) - 1;
  const d = parseInt(normalized.substring(6, 8));
  const ts = Date.UTC(y, m, d);
  return Number.isFinite(ts) ? Math.floor(ts / 86400000) : undefined;
};

const dayToDisplay = (dayNum: number) => {
  const date = new Date(dayNum * 86400000);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" });
};

const serviceInDateRange = (service: RouteServiceRow, range: [number, number]) => {
  const startDay = gtfsDateToDay(service.start_date);
  const endDay = gtfsDateToDay(service.end_date);
  if (startDay === undefined && endDay === undefined) return true;
  const sStart = startDay ?? endDay!;
  const sEnd = endDay ?? startDay!;
  return sStart <= range[1] && sEnd >= range[0];
};

const secondsValue = (value?: number | string) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const formatTripTime = (value?: number | string) => {
  const s = secondsValue(value);
  if (s === undefined) return "";
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
};

const formatTimeRange = (v: [number, number]) => `${formatTripTime(v[0])} - ${formatTripTime(v[1])}`;

const STATION_ROUTE_TYPES = new Set(["Subway, Metro", "Rail", "Tram, Streetcar, Light rail", "Monorail", "Funicular"]);
const defaultStopView = (rt?: string): "stops" | "stations" => rt && STATION_ROUTE_TYPES.has(rt) ? "stations" : "stops";

const TRIP_COLORS = ["bg-primary", "bg-orange-500", "bg-violet-500", "bg-teal-500", "bg-rose-500"];
const TRIP_LINE_COLORS = ["#3b82f6", "#f97316", "#8b5cf6", "#14b8a6", "#f43f5e"];

function SelectedBar({ label, value, detail, onClear }: { label: string; value: string; detail?: string; onClear: () => void }) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-md border bg-primary/5 px-3 py-2 cursor-pointer hover:bg-primary/10 transition-colors"
      onClick={onClear} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClear(); }}
    >
      <BiX className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-xs font-medium uppercase text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-semibold">{value}</span>
      {detail ? <span className="hidden truncate text-xs text-muted-foreground sm:inline">{detail}</span> : null}
    </div>
  );
}

function RouteService({
  routeId, services, selectedServiceId, selectedTripId, initialCompareTripIds, routeTypeName, hasStopTimes = true, onSelectionChange,
}: {
  routeId: string; services: RouteServiceRow[]; selectedServiceId?: string;
  selectedTripId?: string; initialCompareTripIds?: string; routeTypeName?: string; hasStopTimes?: boolean;
  onSelectionChange?: (serviceId?: string, tripId?: string) => void;
}) {
  const { conn, initialized } = useDuckDB();
  const [serviceFilterId, setServiceFilterId] = useState("");
  const [tripFilterId, setTripFilterId] = useState("");
  const [headsignFilter, setHeadsignFilter] = useState("");
  const [timeRange, setTimeRange] = useState<[number, number]>([0, 86400]);
  const [compareTripIds, setCompareTripIds] = useState<string[]>(() => {
    if (!initialCompareTripIds) return [];
    return initialCompareTripIds.split(",").map((s) => s.trim()).filter(Boolean)
      .filter((id) => id !== selectedTripId);
  });
  const [isPicking, setIsPicking] = useState(false);
  const [tripView, setTripView] = useState<"table" | "service">("table");

  const stopView = defaultStopView(routeTypeName);

  const serviceRows = useMemo(() => services.map((s) => ({ ...s, service_days: serviceDays(s) })), [services]);
  const selectedService = useMemo(() => {
    if (!selectedServiceId) return undefined;
    return serviceRows.find((s) => String(s.service_id) === String(selectedServiceId));
  }, [selectedServiceId, serviceRows]);

  const dateBounds = useMemo<[number, number] | undefined>(() => {
    const days = services.flatMap((s) => [gtfsDateToDay(s.start_date), gtfsDateToDay(s.end_date)]).filter((d): d is number => d !== undefined);
    if (days.length === 0) return undefined;
    return [Math.min(...days), Math.max(...days)];
  }, [services]);
  const [dateRange, setDateRange] = useState<[number, number] | undefined>(undefined);
  useEffect(() => { if (dateBounds && !dateRange) setDateRange(dateBounds); }, [dateBounds]);

  const initialCompareApplied = useRef(false);
  useEffect(() => {
    setTripFilterId("");
    setHeadsignFilter("");
    setIsPicking(false);
    // Preserve initial compare trip IDs on first mount; clear on subsequent service changes
    if (initialCompareApplied.current) {
      setCompareTripIds([]);
    }
    initialCompareApplied.current = true;
  }, [selectedServiceId]);

  const servicesByDate = useMemo(() => {
    if (!dateRange || !dateBounds) return serviceRows;
    if (dateRange[0] === dateBounds[0] && dateRange[1] === dateBounds[1]) return serviceRows;
    return serviceRows.filter((s) => serviceInDateRange(s, dateRange));
  }, [dateRange, dateBounds, serviceRows]);

  const filteredServices = useMemo(() => {
    if (!serviceFilterId) return servicesByDate;
    return servicesByDate.filter((s) => String(s.service_id || "") === String(serviceFilterId));
  }, [serviceFilterId, servicesByDate]);

  const serviceOptions = useMemo(() => servicesByDate.map((s) => ({ value: String(s.service_id), label: String(s.service_id) })), [servicesByDate]);

  const handleServiceSelect = (service?: RouteServiceRow) => {
    setServiceFilterId(service?.service_id || "");
    onSelectionChange?.(service?.service_id, undefined);
  };
  const handleServiceDropdownChange = (value?: string) => {
    handleServiceSelect(value ? servicesByDate.find((s) => String(s.service_id) === String(value)) : undefined);
  };

  const { data: serviceTrips = [], error: serviceTripsError, isLoading: serviceTripsLoading } = useQuery({
    queryKey: ["fetchServiceRouteTripsForServiceData", routeId, selectedServiceId],
    queryFn: async () => fetchServiceRouteTripsForServiceData(conn, routeId, selectedServiceId!),
    enabled: !!conn && !!routeId && !!selectedServiceId && initialized, retry: false,
  });

  const selectedTrip = useMemo(() => {
    if (!selectedTripId) return undefined;
    return serviceTrips.find((t: RouteTrip) => String(t.trip_id) === String(selectedTripId));
  }, [selectedTripId, serviceTrips]);

  const { data: stopTimes = [], error: stopTimesError, isLoading: stopTimesLoading } = useQuery({
    queryKey: ["fetchServiceTripStopTimesData", selectedTripId],
    queryFn: async () => fetchServiceTripStopTimesData(conn, selectedTripId!),
    enabled: !!conn && !!selectedTripId && initialized, retry: false,
  });

  // Compare trips data
  const compareTrips = useMemo(() =>
    compareTripIds
      .map((id) => serviceTrips.find((t: RouteTrip) => String(t.trip_id) === id))
      .filter(Boolean) as RouteTrip[],
  [compareTripIds, serviceTrips]);

  const { data: compareStopTimesMap = {}, isLoading: compareLoading } = useQuery({
    queryKey: ["fetchCompareStopTimes", compareTripIds],
    queryFn: async () => {
      const entries = await Promise.all(
        compareTripIds.map(async (id) => [id, await fetchServiceTripStopTimesData(conn, id)] as const),
      );
      return Object.fromEntries(entries) as Record<string, TripStopTime[]>;
    },
    enabled: !!conn && compareTripIds.length > 0 && initialized, retry: false,
  });

  const maxCompareSlots = Math.min(4, Math.max(0, serviceTrips.length - 1));
  const allSelectedIds = new Set([selectedTripId, ...compareTripIds].filter(Boolean));

  const headsignOptions = useMemo(() => {
    const set = new Set<string>();
    serviceTrips.forEach((t: RouteTrip) => { if (t.trip_headsign) set.add(t.trip_headsign); });
    return Array.from(set).sort().map((h) => ({ value: h, label: h }));
  }, [serviceTrips]);

  const tripTimeBounds = useMemo<[number, number]>(() => {
    const vals = serviceTrips.flatMap((t: RouteTrip) => [secondsValue(t.first_departure_seconds), secondsValue(t.last_arrival_seconds)]).filter((v): v is number => v !== undefined);
    if (vals.length === 0) return [0, 86400];
    return [Math.max(0, Math.floor(Math.min(...vals) / 300) * 300), Math.ceil(Math.max(...vals) / 300) * 300];
  }, [serviceTrips]);

  const sliderBounds = useMemo<[number, number]>(() => {
    if (tripTimeBounds[0] !== tripTimeBounds[1]) return tripTimeBounds;
    return [Math.max(0, tripTimeBounds[0] - 300), tripTimeBounds[1] + 300];
  }, [tripTimeBounds]);

  useEffect(() => { setTimeRange(tripTimeBounds); }, [selectedServiceId, tripTimeBounds[0], tripTimeBounds[1]]);

  const filteredTrips = useMemo(() => serviceTrips.filter((trip: RouteTrip) => {
    if (tripFilterId && String(trip.trip_id) !== String(tripFilterId)) return false;
    if (headsignFilter && trip.trip_headsign !== headsignFilter) return false;
    const start = secondsValue(trip.first_departure_seconds);
    const end = secondsValue(trip.last_arrival_seconds) ?? start;
    if (start === undefined && end === undefined) return true;
    return (start ?? end ?? 0) <= timeRange[1] && (end ?? start ?? 0) >= timeRange[0];
  }), [serviceTrips, timeRange, tripFilterId, headsignFilter]);

  const tripOptions = useMemo(() => serviceTrips.map((t: RouteTrip) => ({ value: String(t.trip_id), label: String(t.trip_id) })), [serviceTrips]);

  const handleTripSelect = (trip?: RouteTrip) => {
    setTripFilterId(trip?.trip_id || "");
    setCompareTripIds([]); setIsPicking(false);
    onSelectionChange?.(selectedServiceId, trip?.trip_id);
  };
  const handleTripDropdownChange = (v?: string) => handleTripSelect(v ? serviceTrips.find((t: RouteTrip) => String(t.trip_id) === String(v)) : undefined);

  const startPicking = () => {
    setTripFilterId(""); setHeadsignFilter(""); setTimeRange(tripTimeBounds); setIsPicking(true);
  };
  const cancelPicking = () => setIsPicking(false);

  const hasDateFilter = dateRange && dateBounds && (dateRange[0] !== dateBounds[0] || dateRange[1] !== dateBounds[1]);
  const hasServiceFilters = Boolean(serviceFilterId || hasDateFilter);

  const serviceColumns = useMemo<ColumnDef<RouteServiceRow>[]>(() => [
    { accessorKey: "service_id", header: "Service ID" }, { accessorKey: "service_days", header: "Days" },
    { accessorKey: "start_date", header: "Start" }, { accessorKey: "end_date", header: "End" },
    { accessorKey: "trip_count", header: "Trips" }, { accessorKey: "shape_count", header: "Shapes" },
    { accessorKey: "added_dates", header: "Added Dates" }, { accessorKey: "removed_dates", header: "Removed Dates" },
    { accessorKey: "first_exception_date", header: "First Exception" }, { accessorKey: "last_exception_date", header: "Last Exception" },
  ], []);

  const tripColumns = useMemo<ColumnDef<RouteTrip>[]>(() => [
    { accessorKey: "trip_id", header: "Trip ID" }, { accessorKey: "trip_headsign", header: "Headsign" },
    { accessorKey: "first_departure_time", header: "First Departure", cell: ({ row }) => formatTripTime(row.original.first_departure_seconds) || row.original.first_departure_time || "" },
    { accessorKey: "last_arrival_time", header: "Last Arrival", cell: ({ row }) => formatTripTime(row.original.last_arrival_seconds) || row.original.last_arrival_time || "" },
    { accessorKey: "direction_id", header: "Direction" }, { accessorKey: "shape_id", header: "Shape" }, { accessorKey: "block_id", header: "Block" },
  ], []);

  return (
    <div className="space-y-4">
      {/* Selected bars */}
      {selectedService ? (
        <SelectedBar label="Service" value={selectedService.service_id}
          detail={`${selectedService.service_days} • ${selectedService.trip_count || 0} trips`}
          onClear={() => handleServiceSelect(undefined)} />
      ) : null}

      {selectedTrip ? (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <SelectedBar label="Trip" value={selectedTrip.trip_id}
              detail={selectedTrip.trip_headsign || `${formatTripTime(selectedTrip.first_departure_seconds)} → ${formatTripTime(selectedTrip.last_arrival_seconds)}`}
              onClear={() => handleTripSelect(undefined)} />
          </div>
          {!isPicking && compareTrips.length < maxCompareSlots && (
            <div className="flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium cursor-pointer hover:bg-muted transition-colors"
              onClick={startPicking} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") startPicking(); }}>
              {compareTrips.length > 0 ? <BiPlus className="h-4 w-4" /> : <BiGitCompare className="h-4 w-4" />}
              <span className="hidden sm:inline">{compareTrips.length > 0 ? "Add" : "Compare"}</span>
            </div>
          )}
          {isPicking && (
            <div className="flex shrink-0 items-center gap-1.5 rounded-md border bg-primary/10 border-primary/50 px-3 py-2 text-xs font-medium cursor-pointer hover:bg-primary/20 transition-colors"
              onClick={cancelPicking} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") cancelPicking(); }}>
              <BiX className="h-4 w-4" />
              <span className="hidden sm:inline">Cancel</span>
            </div>
          )}
        </div>
      ) : null}

      {/* Compare trips chips */}
      {compareTrips.length > 0 && !isPicking ? (
        <div className="flex flex-wrap items-center gap-2">
          {compareTrips.map((ct, idx) => (
            <div key={ct.trip_id}
              className="flex items-center gap-1.5 rounded-md border bg-primary/5 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-primary/10 transition-colors"
              onClick={() => setCompareTripIds((prev) => prev.filter((id) => id !== ct.trip_id))}
              role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setCompareTripIds((prev) => prev.filter((id) => id !== ct.trip_id)); }}>
              <BiX className="h-3.5 w-3.5 text-muted-foreground" />
              <span className={`h-2 w-2 rounded-full shrink-0 ${TRIP_COLORS[(idx + 1) % TRIP_COLORS.length]}`} />
              <span className="font-medium truncate">{ct.trip_id}</span>
              {ct.trip_headsign ? <span className="text-muted-foreground truncate">{ct.trip_headsign}</span> : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Filter area */}
      {!selectedService ? (
        <div className="grid grid-cols-1 gap-2 rounded-md border p-3 md:grid-cols-2">
          <Combobox options={serviceOptions} Message="Service ID" value={serviceFilterId} setValue={handleServiceDropdownChange} />
          {dateBounds ? (
            <div className="grid gap-2 px-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Date Range</span>
                <span>{dateRange ? `${dayToDisplay(dateRange[0])} – ${dayToDisplay(dateRange[1])}` : "All dates"}</span>
              </div>
              <Slider value={dateRange || dateBounds} min={dateBounds[0]} max={dateBounds[1]} step={1}
                onValueChange={(v) => setDateRange([v[0] ?? dateBounds[0], v[1] ?? dateBounds[1]] as [number, number])} />
            </div>
          ) : null}
        </div>
      ) : selectedTrip && hasStopTimes && !isPicking ? (
        <div className="space-y-2">
          <Tabs value={tripView} onValueChange={(v) => setTripView(v as "table" | "service")}>
            <TabsList className="h-8">
              <TabsTrigger value="table" className="text-xs px-3 py-1">Table</TabsTrigger>
              <TabsTrigger value="service" className="text-xs px-3 py-1">Service</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border p-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Time</span>
              <div className="font-medium">{formatTripTime(selectedTrip.first_departure_seconds) || selectedTrip.first_departure_time || "—"} → {formatTripTime(selectedTrip.last_arrival_seconds) || selectedTrip.last_arrival_time || "—"}</div>
            </div>
            {selectedTrip.trip_headsign ? <div><span className="text-xs text-muted-foreground">Headsign</span><div className="font-medium">{selectedTrip.trip_headsign}</div></div> : null}
            <div>
              <span className="text-xs text-muted-foreground">{stopView === "stations" ? "Stations" : "Stops"}</span>
              <div className="font-medium">{stopTimes.length}</div>
            </div>
          </div>
        </div>
      ) : hasStopTimes ? (
        <div className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
          <Combobox options={tripOptions} Message="Trip ID" value={tripFilterId} setValue={handleTripDropdownChange} />
          {headsignOptions.length > 1 && <Combobox options={headsignOptions} Message="Headsign" value={headsignFilter} setValue={(v) => setHeadsignFilter(v || "")} />}
          <div className="grid gap-2 px-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Time</span><span>{formatTimeRange(timeRange)}</span>
            </div>
            <Slider value={timeRange} min={sliderBounds[0]} max={sliderBounds[1]} step={300}
              disabled={serviceTrips.length === 0}
              onValueChange={(v) => setTimeRange([v[0] ?? sliderBounds[0], v[1] ?? sliderBounds[1]] as [number, number])} />
          </div>
        </div>
      ) : null}

      {/* Service table */}
      {!selectedService ? (
        <TableComponent key="all-services" data={filteredServices} columns={serviceColumns}
          ClickInfo={undefined} setClickInfo={hasStopTimes ? handleServiceSelect : undefined} selectionKey="service_id"
          hasActiveFilters={hasServiceFilters} onSortingChange={undefined} clearSortingTrigger={undefined}
          onClearFilters={() => { setServiceFilterId(""); setDateRange(dateBounds); handleServiceSelect(undefined); }}>
          {hasStopTimes ? (
            <div className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/30">Select a service row to show trips</div>
          ) : (
            <div className="text-sm text-yellow-800 dark:text-yellow-200 p-3 border border-yellow-300 rounded-md bg-yellow-50 dark:bg-yellow-900/20">
              stop_times.txt not imported — trip selection disabled
            </div>
          )}
        </TableComponent>
      ) : null}

      {selectedService && hasStopTimes && serviceTripsLoading ? <Skeleton className="h-64 w-full" /> : null}
      {selectedService && hasStopTimes && serviceTripsError ? <div className="rounded-md border p-3 text-sm text-muted-foreground">Error loading service trips.</div> : null}

      {/* Trip table — initial selection or compare picking */}
      {selectedService && hasStopTimes && !serviceTripsLoading && !serviceTripsError && (!selectedTrip || isPicking) ? (
        <TableComponent
          key={isPicking ? `pick-${selectedServiceId}` : selectedServiceId}
          data={isPicking ? filteredTrips.filter((t: RouteTrip) => !allSelectedIds.has(String(t.trip_id))) : filteredTrips}
          columns={tripColumns}
          ClickInfo={undefined}
          setClickInfo={(trip: RouteTrip | undefined) => {
            if (!trip) return;
            if (isPicking) {
              setCompareTripIds((prev) => [...prev, String(trip.trip_id)]);
              setIsPicking(false);
            } else {
              handleTripSelect(trip);
            }
          }}
          selectionKey="trip_id" onSortingChange={undefined} clearSortingTrigger={undefined}
          hasActiveFilters={Boolean(tripFilterId || headsignFilter || timeRange[0] !== tripTimeBounds[0] || timeRange[1] !== tripTimeBounds[1])}
          onClearFilters={() => { setTripFilterId(""); setHeadsignFilter(""); setTimeRange(tripTimeBounds); if (!isPicking) handleTripSelect(undefined); }}>
          <div className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/30">
            {isPicking ? "Select a trip to compare with" : "Select a trip row to show its route"}
          </div>
        </TableComponent>
      ) : null}

      {/* Stop times / service diagram */}
      {selectedTrip && hasStopTimes && !isPicking && (
        <div>
          {stopTimesLoading ? <Skeleton className="h-64 w-full" /> : stopTimesError ? (
            <div className="rounded-md border p-3 text-sm text-muted-foreground">Error loading trip route.</div>
          ) : tripView === "service" ? (
            compareLoading && compareTrips.length > 0 ? <Skeleton className="h-64 w-full" /> : (
              <TripServiceDiagram
                trips={[{ trip: selectedTrip, stopTimes }, ...compareTrips.map((ct) => ({ trip: ct, stopTimes: compareStopTimesMap[ct.trip_id] || [] }))]}
                view={stopView} />
            )
          ) : compareTrips.length > 0 ? (
            compareLoading ? <Skeleton className="h-64 w-full" /> : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TripStopPanel trip={selectedTrip} stopTimes={stopTimes} view={stopView} />
                {compareTrips.map((ct) => (
                  <TripStopPanel key={ct.trip_id} trip={ct} stopTimes={compareStopTimesMap[ct.trip_id] || []} view={stopView} />
                ))}
              </div>
            )
          ) : (
            <TripStopPanel trip={selectedTrip} stopTimes={stopTimes} view={stopView} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Service Diagram ──────────────────────────────────────────────
function TripServiceDiagram({ trips, view }: {
  trips: Array<{ trip: RouteTrip; stopTimes: TripStopTime[] }>;
  view: "stops" | "stations";
}) {
  const getKey = (st: TripStopTime) =>
    view === "stations" ? (st.station_name || st.stop_name || st.stop_id || "") : (st.stop_id || st.stop_name || "");
  const getName = (st: TripStopTime) =>
    view === "stations" ? (st.station_name || st.stop_name || "") : (st.stop_name || "");

  const tripLists = useMemo(() => trips.map(({ stopTimes: st }) => {
    const raw = st.map((s) => ({ key: getKey(s), name: getName(s), time: s.departure_time || s.arrival_time || "" }));
    if (view !== "stations") return raw;
    const deduped: typeof raw = [];
    for (const s of raw) { if (!deduped.length || deduped[deduped.length - 1].key !== s.key) deduped.push(s); }
    return deduped;
  }), [trips, view]);

  const tripSets = useMemo(() => tripLists.map((l) => new Set(l.map((s) => s.key))), [tripLists]);

  const merged = useMemo(() => {
    const allKeys = new Set<string>();
    const order: string[] = [];
    const pointers = tripLists.map(() => 0);
    const advance = () => {
      for (let i = 0; i < tripLists.length; i++) {
        while (pointers[i] < tripLists[i].length && allKeys.has(tripLists[i][pointers[i]].key)) pointers[i]++;
        if (pointers[i] < tripLists[i].length) {
          allKeys.add(tripLists[i][pointers[i]].key);
          order.push(tripLists[i][pointers[i]].key);
          pointers[i]++;
          return true;
        }
      }
      return false;
    };
    while (advance()) {}
    return order.map((key) => {
      const inTrips = tripSets.map((s) => s.has(key));
      const times = tripLists.map((l) => l.find((s) => s.key === key)?.time || "");
      const name = tripLists.find((l) => l.find((s) => s.key === key))?.find((s) => s.key === key)?.name || key;
      return { key, name, inTrips, times, shared: inTrips.every(Boolean) };
    });
  }, [tripLists, tripSets]);

  const lineSpacing = 20;
  const dotR = 5;
  const rowH = 40;
  const linesW = trips.length * lineSpacing;
  const svgH = merged.length * rowH + 24;

  return (
    <div className="rounded-md border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b px-4 py-2 space-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {trips.map(({ trip }, idx) => {
            const color = TRIP_LINE_COLORS[idx % TRIP_LINE_COLORS.length];
            const isDown = trip.direction_id === undefined || trip.direction_id === null || trip.direction_id === 0;
            return (
              <span key={trip.trip_id} className="flex items-center gap-1.5">
                <span className="rounded-full shrink-0" style={{ width: 8, height: 8, backgroundColor: color }} />
                <svg width="10" height="10" viewBox="0 0 10 10" style={{ opacity: 0.7 }}>
                  {isDown
                    ? <path d="M5 1v6M2.5 5L5 8l2.5-3" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    : <path d="M5 9V3M2.5 5L5 2l2.5 3" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
                </svg>
                <span className="truncate max-w-[200px] font-medium">{trip.trip_headsign || trip.trip_id}</span>
              </span>
            );
          })}
        </div>
      </div>
      {/* Diagram */}
      <div className="overflow-auto max-h-[60vh]">
        <div className="flex">
          {/* SVG lines area */}
          <div className="shrink-0" style={{ width: linesW + 8 }}>
            <svg width={linesW + 8} height={svgH} className="block">
              {trips.map(({ trip }, idx) => {
                const color = TRIP_LINE_COLORS[idx % TRIP_LINE_COLORS.length];
                const cx = idx * lineSpacing + lineSpacing / 2 + 4;
                const isDown = trip.direction_id === undefined || trip.direction_id === null || trip.direction_id === 0;

                // Build segments between consecutive served stops
                const servedStops: Array<{ y: number; shared: boolean }> = [];
                merged.forEach((stop, i) => {
                  if (stop.inTrips[idx]) {
                    servedStops.push({ y: i * rowH + rowH / 2 + 12, shared: stop.shared });
                  }
                });

                const isSingle = trips.length === 1;

                return (
                  <g key={`line-${trip.trip_id}`}>
                    {servedStops.map((s, si) => {
                      if (si === 0) return null;
                      const prev = servedStops[si - 1];
                      return <line key={si} x1={cx} y1={prev.y} x2={cx} y2={s.y} stroke={color} strokeWidth={2} opacity={0.4} />;
                    })}
                    {/* Dots */}
                    {merged.map((stop, i) => {
                      if (!stop.inTrips[idx]) return null;
                      const y = i * rowH + rowH / 2 + 12;
                      return (
                        <circle key={i} cx={cx} cy={y} r={dotR}
                          fill={color} stroke="var(--background)" strokeWidth={2} />
                      );
                    })}
                    {/* Direction arrow */}
                    <path d={isDown
                      ? `M${cx - 3.5},${svgH - 10}l3.5,6l3.5,-6`
                      : `M${cx - 3.5},10l3.5,-6l3.5,6`}
                      fill={color} opacity={0.6} />
                  </g>
                );
              })}
            </svg>
          </div>
          {/* Stop labels */}
          <div className="flex-1 min-w-0 pt-3">
            {merged.map((stop, i) => (
              <div key={`${stop.key}-${i}`} className="flex flex-col justify-center px-3" style={{ height: rowH }}>
                <div className="text-sm font-medium leading-tight truncate">{stop.name || stop.key}</div>
                {stop.times.some((t, idx) => stop.inTrips[idx] && t) && (
                  <div className="flex flex-wrap gap-x-3 mt-0.5 text-[11px] text-muted-foreground">
                    {stop.inTrips.map((inThis, idx) => inThis && stop.times[idx] ? (
                      <span key={idx} className="flex items-center gap-1">
                        <span className="rounded-full shrink-0" style={{ width: 5, height: 5, backgroundColor: TRIP_LINE_COLORS[idx % TRIP_LINE_COLORS.length] }} />
                        {stop.times[idx]}
                      </span>
                    ) : null)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Trip Stop Panel ──────────────────────────────────────────────
function TripStopPanel({ trip, stopTimes, view }: {
  trip: RouteTrip; stopTimes: TripStopTime[]; view: "stops" | "stations";
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground truncate">
          {trip.trip_id}{trip.trip_headsign ? ` — ${trip.trip_headsign}` : ""}
          {trip.direction_id !== undefined && trip.direction_id !== null ? (
            <span className="ml-1 text-muted-foreground/60">(dir {trip.direction_id})</span>
          ) : null}
        </span>
      </div>
      <TripStopSequence stopTimes={stopTimes} view={view} />
    </div>
  );
}

// ─── Trip Stop Sequence Table ─────────────────────────────────────
function TripStopSequence({ stopTimes, view }: { stopTimes: TripStopTime[]; view: "stops" | "stations" }) {
  if (view === "stations") {
    const grouped: Array<{ station_name: string; sequence: number; stop_count: number; arrival_time: string; departure_time: string }> = [];
    for (const st of stopTimes) {
      const name = st.station_name || st.stop_name || "Unknown";
      const last = grouped[grouped.length - 1];
      if (last && last.station_name === name) { last.stop_count++; last.departure_time = st.departure_time || last.departure_time; }
      else grouped.push({ station_name: name, sequence: grouped.length + 1, stop_count: 1, arrival_time: st.arrival_time || "", departure_time: st.departure_time || "" });
    }
    return (
      <div className="rounded-md border shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted z-10">
              <tr><th className="px-3 py-2 text-left text-xs font-medium">#</th><th className="px-3 py-2 text-left text-xs font-medium">Station</th><th className="px-3 py-2 text-left text-xs font-medium">Arrival</th><th className="px-3 py-2 text-left text-xs font-medium">Departure</th></tr>
            </thead>
            <tbody>
              {grouped.length > 0 ? grouped.map((g, i) => (
                <tr key={i} className="border-t hover:bg-muted/50">
                  <td className="px-3 py-2 text-muted-foreground">{g.sequence}</td>
                  <td className="px-3 py-2 font-medium">{g.station_name}{g.stop_count > 1 ? <span className="ml-1.5 text-xs text-muted-foreground">({g.stop_count} stops)</span> : null}</td>
                  <td className="px-3 py-2">{g.arrival_time || "—"}</td><td className="px-3 py-2">{g.departure_time || "—"}</td>
                </tr>
              )) : <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">No stop times available</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md border shadow-sm overflow-hidden">
      <div className="overflow-auto max-h-[60vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted z-10">
            <tr><th className="px-3 py-2 text-left text-xs font-medium">#</th><th className="px-3 py-2 text-left text-xs font-medium">Stop</th><th className="px-3 py-2 text-left text-xs font-medium">ID</th><th className="px-3 py-2 text-left text-xs font-medium">Arrival</th><th className="px-3 py-2 text-left text-xs font-medium">Departure</th><th className="px-3 py-2 text-left text-xs font-medium">Station</th></tr>
          </thead>
          <tbody>
            {stopTimes.length > 0 ? stopTimes.map((st, i) => (
              <tr key={i} className="border-t hover:bg-muted/50">
                <td className="px-3 py-2 text-muted-foreground">{st.stop_sequence}</td>
                <td className="px-3 py-2 font-medium">{st.stop_name || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground text-xs">{st.stop_id || "—"}</td>
                <td className="px-3 py-2">{st.arrival_time || "—"}</td><td className="px-3 py-2">{st.departure_time || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground text-xs">{st.station_name || "—"}</td>
              </tr>
            )) : <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">No stop times available</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RouteService;
