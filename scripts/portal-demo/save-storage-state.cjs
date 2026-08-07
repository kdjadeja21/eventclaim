/**
 * One-time helper: sign in with Google in a headed browser, then save
 * Playwright storageState for scripts/portal-demo/build-portal-demo.cjs.
 *
 * Usage (from repo root, with the app running):
 *   cd scripts/portal-demo && npm i playwright@1.52.0 && npx playwright install chromium
 *   DEMO_BASE_URL=http://127.0.0.1:3000 node save-storage-state.cjs
 */
const fs = require("fs");
const path = require("path");

function resolvePlaywright() {
  const candidates = [
    path.join(__dirname, "node_modules", "playwright"),
    path.join(__dirname, "..", "..", "node_modules", "playwright"),
    "/tmp/demo-video/node_modules/playwright",
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // try next
    }
  }
  throw new Error(
    "playwright not found. From scripts/portal-demo run: npm init -y && npm i playwright@1.52.0 && npx playwright install chromium"
  );
}

const { chromium } = resolvePlaywright();

const BASE = process.env.DEMO_BASE_URL || "http://127.0.0.1:3000";
const OUT = path.join(__dirname, "storageState.json");

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(0);

  console.log(`Open ${BASE}/login and complete Google sign-in…`);
  await page.goto(`${BASE}/login?redirect=/dashboard`, {
    waitUntil: "domcontentloaded",
  });

  await page.waitForURL((url) => /\/dashboard\/?$/.test(url.pathname), {
    timeout: 0,
  });
  await page.getByText("Total Events").waitFor({ timeout: 60000 });

  const state = await context.storageState();
  fs.writeFileSync(OUT, JSON.stringify(state, null, 2));
  console.log("Wrote", OUT);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
