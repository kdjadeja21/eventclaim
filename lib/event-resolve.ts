import { cache } from "react";
import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { Event } from "@/lib/types";

export function isFirestoreQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  return (
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("Quota exceeded") ||
    code === "8"
  );
}

export const getEventBySlugCached = cache(async (slug: string): Promise<Event | null> => {
  await requireSession();
  const snap = await adminDb
    .collection("events")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { ...(doc.data() as Event), id: doc.id };
});

export async function batchGetRegistrations(
  eventId: string,
  ids: string[]
): Promise<import("@/lib/types").Registration[]> {
  const { hydrateRegistration } = await import("@/lib/registrations");
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const regsRef = adminDb.collection("events").doc(eventId).collection("registrations");
  const results: import("@/lib/types").Registration[] = [];

  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100);
    const snaps = await adminDb.getAll(...chunk.map((id) => regsRef.doc(id)));
    for (const snap of snaps) {
      if (snap.exists) {
        results.push(hydrateRegistration(snap.data() as import("@/lib/types").Registration));
      }
    }
  }

  return results;
}

export function collectTeamRegistrationIds(teams: import("@/lib/types").Team[]): string[] {
  const ids = new Set<string>();
  for (const team of teams) {
    if (team.leadRegistrationId) ids.add(team.leadRegistrationId);
    for (const memberId of team.memberRegistrationIds) ids.add(memberId);
  }
  return [...ids];
}
