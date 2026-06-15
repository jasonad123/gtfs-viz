import { lazy } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { isCliSession } from "@/lib/cli/isCliSession";

const Export = lazy(() => import("@/client/Export"));

export const Route = createFileRoute("/_layout/export/")({
  component: ExportPage,
  beforeLoad: () => {
    if (isCliSession()) return;

    const initialized = localStorage.getItem('gtfs_data_initialized') === 'true';
    if (!initialized) {
      throw redirect({ to: "/" });
    }
  },
});

function ExportPage() {
  return (
    <div className="p-4">
      <Export />
    </div>
  );
}
