"use server";

import { requireSession } from "@/lib/session";
import {
  createVolunteer,
  deactivateVolunteer,
  resetVolunteerPin,
} from "@/lib/confirmation/volunteer-auth";
import { revalidatePath } from "next/cache";
import { ConfirmationVolunteer } from "@/lib/confirmation/types";

export async function createVolunteerAction(
  name: string,
  username?: string
): Promise<{ success: boolean; volunteer?: ConfirmationVolunteer; error?: string }> {
  const session = await requireSession();
  try {
    const volunteer = await createVolunteer(name, username, session.uid);
    revalidatePath("/confirmations");
    revalidatePath("/confirmations/volunteers");
    return { success: true, volunteer };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create volunteer.",
    };
  }
}

export async function toggleVolunteerActiveAction(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  try {
    await deactivateVolunteer(id, isActive, session.uid);
    revalidatePath("/confirmations");
    revalidatePath("/confirmations/volunteers");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update volunteer.",
    };
  }
}

export async function resetVolunteerPinAction(
  id: string
): Promise<{ success: boolean; pin?: string; error?: string }> {
  const session = await requireSession();
  try {
    const pin = await resetVolunteerPin(id, session.uid);
    revalidatePath("/confirmations");
    revalidatePath("/confirmations/volunteers");
    return { success: true, pin };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to reset PIN.",
    };
  }
}
