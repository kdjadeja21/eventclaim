import { adminDb } from "@/lib/firebase/admin";
import { slugify } from "@/lib/utils";
import { nanoid } from "nanoid";
import { writeConfirmationAuditLog } from "@/lib/confirmation/audit";
import { createVolunteerSession } from "@/lib/confirmation/volunteer-session";
import { ConfirmationVolunteer } from "@/lib/confirmation/types";

const PIN_MAX_ATTEMPTS = 10;
const PIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function ensureUniqueUsername(base: string): Promise<string> {
  const volunteersRef = adminDb.collection("confirmationVolunteers");
  let candidate = base;
  let suffix = 1;

  while (true) {
    const existing = await volunteersRef
      .where("username", "==", candidate)
      .limit(1)
      .get();
    if (existing.empty) return candidate;
    suffix++;
    candidate = `${base}-${suffix}`;
  }
}

export async function createVolunteer(
  name: string,
  username?: string,
  actorId = "admin"
): Promise<ConfirmationVolunteer> {
  const baseUsername = slugify(username || name);
  if (!baseUsername) throw new Error("A valid name or username is required.");

  const finalUsername = await ensureUniqueUsername(baseUsername);
  const id = nanoid();
  const pin = generatePin();
  const token = `${finalUsername}-${nanoid(6)}`;

  const volunteer: ConfirmationVolunteer = {
    id,
    name: name.trim(),
    username: finalUsername,
    pin,
    token,
    isActive: true,
    createdAt: new Date().toISOString(),
    failedPinAttempts: 0,
    pinLockedUntil: null,
  };

  await adminDb.collection("confirmationVolunteers").doc(id).set(volunteer);

  await writeConfirmationAuditLog({
    action: "volunteer_created",
    actorType: "admin",
    actorId,
    volunteerId: id,
    metadata: { name: volunteer.name, username: volunteer.username },
  });

  return volunteer;
}

export async function deactivateVolunteer(
  id: string,
  isActive: boolean,
  actorId = "admin"
): Promise<void> {
  await adminDb.collection("confirmationVolunteers").doc(id).update({
    isActive,
  });

  await writeConfirmationAuditLog({
    action: "volunteer_deactivated",
    actorType: "admin",
    actorId,
    volunteerId: id,
    metadata: { isActive },
  });
}

export async function resetVolunteerPin(
  id: string,
  actorId = "admin"
): Promise<string> {
  const pin = generatePin();
  await adminDb.collection("confirmationVolunteers").doc(id).update({
    pin,
    failedPinAttempts: 0,
    pinLockedUntil: null,
  });

  await writeConfirmationAuditLog({
    action: "volunteer_pin_reset",
    actorType: "admin",
    actorId,
    volunteerId: id,
    metadata: {},
  });

  return pin;
}

export async function getVolunteerByToken(
  token: string
): Promise<ConfirmationVolunteer | null> {
  const snap = await adminDb
    .collection("confirmationVolunteers")
    .where("token", "==", token)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data() as ConfirmationVolunteer;
}

export async function getVolunteerById(
  id: string
): Promise<ConfirmationVolunteer | null> {
  const snap = await adminDb.collection("confirmationVolunteers").doc(id).get();
  if (!snap.exists) return null;
  return snap.data() as ConfirmationVolunteer;
}

export interface VerifyPinResult {
  success: boolean;
  error?: string;
}

/**
 * Verifies a volunteer's PIN by token, tracks failed attempts / lockout, and
 * on success creates the signed session cookie.
 */
export async function verifyVolunteerPin(
  token: string,
  pin: string
): Promise<VerifyPinResult> {
  const volunteer = await getVolunteerByToken(token);
  if (!volunteer || !volunteer.isActive) {
    return { success: false, error: "Invalid or inactive volunteer link." };
  }

  const volunteerRef = adminDb.collection("confirmationVolunteers").doc(volunteer.id);

  if (volunteer.pinLockedUntil) {
    const lockedUntilMs = new Date(volunteer.pinLockedUntil).getTime();
    if (Date.now() < lockedUntilMs) {
      return {
        success: false,
        error: "Too many incorrect attempts. Try again later.",
      };
    }
  }

  if (pin.trim() !== volunteer.pin) {
    const failedPinAttempts = (volunteer.failedPinAttempts ?? 0) + 1;
    const shouldLock = failedPinAttempts >= PIN_MAX_ATTEMPTS;

    await volunteerRef.update({
      failedPinAttempts,
      pinLockedUntil: shouldLock
        ? new Date(Date.now() + PIN_LOCKOUT_MS).toISOString()
        : null,
    });

    return {
      success: false,
      error: shouldLock
        ? "Too many incorrect attempts. Try again later."
        : "Incorrect PIN.",
    };
  }

  await volunteerRef.update({ failedPinAttempts: 0, pinLockedUntil: null });
  await createVolunteerSession(volunteer.id);

  return { success: true };
}
