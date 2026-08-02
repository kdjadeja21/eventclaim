import { getEventCountStats as getEventCountStatsRepo } from "@/lib/db/repos/stats";
import { EventStats } from "@/lib/types";

export async function getEventCountStats(eventId: string): Promise<EventStats> {
  return getEventCountStatsRepo(eventId);
}
