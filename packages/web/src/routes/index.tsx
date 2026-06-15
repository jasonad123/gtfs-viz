import { createFileRoute, redirect } from "@tanstack/react-router";
import { isCliSession } from "@/lib/cli/isCliSession";
import Intro from "@/client/Intro";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // CLI sessions should never see the import page — redirect to data views
    if (isCliSession()) {
      throw redirect({ to: "/stations/map" });
    }
  },
  component: Intro,
});
