"use server";

import { getEventCountStats } from "@/lib/event-stats";
import { EventStats } from "@/lib/types";
import { requireAccessibleEventById } from "@/lib/auth/event-access";

export async function getEventStats(eventId: string): Promise<EventStats> {
  await requireAccessibleEventById(eventId);
  return getEventCountStats(eventId);
}
