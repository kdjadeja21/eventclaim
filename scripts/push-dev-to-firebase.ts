/**
 * Push local dev JSON store to Firebase (production sync after development).
 *
 * Requires FIREBASE_SERVICE_ACCOUNT and NEXT_PUBLIC_FIREBASE_PROJECT_ID.
 *
 * Usage:
 *   USE_DEV_DATA=true npm run dev:data:push
 *   USE_DEV_DATA=true npm run dev:data:push -- --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { devDataFilePath } from "../lib/dev-mode";
import type { DevDataFile } from "../lib/dev-store";

const dryRun = process.argv.includes("--dry-run");

function getAdminDb() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is required to push dev data to Firebase.");
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert(JSON.parse(serviceAccountJson)),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });

  return getFirestore(app);
}

function loadDevFile(): DevDataFile {
  const filePath = path.isAbsolute(devDataFilePath())
    ? devDataFilePath()
    : path.join(process.cwd(), devDataFilePath());

  if (!fs.existsSync(filePath)) {
    throw new Error(`Dev data file not found: ${filePath}. Run npm run dev:data:generate first.`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as DevDataFile;
}

async function pushDevToFirebase(): Promise<void> {
  const store = loadDevFile();
  const db = getAdminDb();
  const eventId = store.event.id;
  const eventRef = db.collection("events").doc(eventId);

  console.log(`Event: ${store.event.name} (${store.event.slug})`);
  console.log(
    `Registrations: ${store.registrations.length}, Teams: ${store.teams.length}, Team links: ${store.teamLinks.length}`
  );

  if (dryRun) {
    console.log("Dry run — no writes performed.");
    return;
  }

  await eventRef.set(store.event, { merge: true });

  const batchLimit = 450;
  let batch = db.batch();
  let ops = 0;

  async function commitIfNeeded(force = false) {
    if (ops === 0) return;
    if (force || ops >= batchLimit) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  for (const reg of store.registrations) {
    batch.set(eventRef.collection("registrations").doc(reg.id), reg, { merge: true });
    ops++;
    await commitIfNeeded();
  }

  for (const team of store.teams) {
    batch.set(eventRef.collection("teams").doc(team.id), team, { merge: true });
    ops++;
    await commitIfNeeded();
  }

  for (const link of store.teamLinks) {
    batch.set(eventRef.collection("teamLinks").doc(link.id), link, { merge: true });
    ops++;
    await commitIfNeeded();
  }

  await commitIfNeeded(true);

  console.log("Push complete.");
  console.log(`Open teams page: /events/${store.event.slug}/teams`);
}

pushDevToFirebase().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
