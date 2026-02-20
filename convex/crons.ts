import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "refresh all feeds",
  "0 11 * * *", // 7am ET (11:00 UTC)
  api.feedActions.refreshAll,
  {}
);

export default crons;
