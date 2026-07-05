/** When true, the app reads/writes local JSON instead of Firestore and Luma. */
export function isDevDataMode(): boolean {
  return process.env.USE_DEV_DATA === "true";
}

export function devDataFilePath(): string {
  return (
    process.env.DEV_DATA_FILE?.trim() ||
    "data/dev/hackathon-ahmedabad.json"
  );
}

export const DEV_SESSION_COOKIE_VALUE = "dev-local-session";
