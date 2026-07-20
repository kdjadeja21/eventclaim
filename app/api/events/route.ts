import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { getFriendlyFirestoreMessage } from "@/lib/firestore-errors";
import { Event } from "@/lib/types";

export interface EventsData {
  events: Event[];
}

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const snap = await adminDb
      .collection("events")
      .orderBy("createdAt", "desc")
      .get();
    const events = snap.docs.map((d) => d.data() as Event);
    return NextResponse.json({ events } satisfies EventsData);
  } catch (error) {
    console.error("[api/events] Failed to load events:", error);
    return NextResponse.json(
      { error: "UNAVAILABLE", message: getFriendlyFirestoreMessage(error) },
      { status: 503 }
    );
  }
}
