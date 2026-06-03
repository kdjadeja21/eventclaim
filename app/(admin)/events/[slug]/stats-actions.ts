"use server";

import { requireSession } from "@/lib/session";
import { getEventCountStats } from "@/lib/event-stats";
import { EventStats } from "@/lib/types";

export async function getEventStats(eventId: string): Promise<EventStats> {
  await requireSession();
  return getEventCountStats(eventId);
}
