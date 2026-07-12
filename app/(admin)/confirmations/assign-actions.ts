"use server";

import { requireSession } from "@/lib/session";
import { assignConfirmationAttendees } from "@/lib/confirmation/assignment";
import { ConfirmationAssignResult } from "@/lib/confirmation/types";
import { revalidatePath } from "next/cache";

export async function assignAttendeesAction(): Promise<ConfirmationAssignResult> {
  const session = await requireSession();
  const result = await assignConfirmationAttendees(session.uid);

  revalidatePath("/confirmations");
  revalidatePath("/confirmations/attendees");
  revalidatePath("/confirmations/volunteers");

  return result;
}
