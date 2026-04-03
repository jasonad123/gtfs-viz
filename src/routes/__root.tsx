import { createRootRoute, Outlet } from "@tanstack/react-router";
import { DuckDBProvider, useDuckDB } from "@/context/duckdb.client";
import { ThemeProvider } from "@/context/theme.client";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import "@/styles/index.css";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <DuckDBProvider>
      <ThemeProvider>
        <RouterOutlet />
      </ThemeProvider>
    </DuckDBProvider>
  );
}

function RouterOutlet() {
  const duckdb = useDuckDB();

  return (
    <>
      <LoadingOverlay
        isVisible={duckdb?.isResetting ?? false}
        message={duckdb?.loadingMessage || "Processing..."}
        subMessage={duckdb?.loadingSubMessage || ""}
      />
      <Outlet context={{ duckdb }} />
    </>
  );
}
