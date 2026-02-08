import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "refresh all feeds",
  { minutes: 30 },
  api.feedActions.refreshAll,
  {}
);

export default crons;
