/**
 * Enterprise portal demo builder
 *
 * - Title/end cards (no login chrome in the cut)
 * - Strict waits so skeleton/loading frames never enter the final video
 * - Per-section Playwright recordVideo clipped to exact TTS duration (A/V lock)
 * - Soft WebVTT captions aligned to narration sentence timing
 * - Brief Create temp users coverage (draft-only email verification workflow)
 *
 * Prerequisites: see .cursor/skills/portal-demo-video/SKILL.md
 * Auth: scripts/portal-demo/storageState.json (from save-storage-state.cjs)
 */
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

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

const REPO_ROOT = path.resolve(__dirname, "../..");
const BASE = process.env.DEMO_BASE_URL || "http://127.0.0.1:3000";
const SLUG = "cursor-community-meetup";
const WORK = process.env.DEMO_WORK_DIR || "/tmp/demo-video/build";
const EDGE = process.env.EDGE_TTS_BIN || path.join(process.env.HOME || "", ".local/bin/edge-tts");
// Conversational neural voice (more natural than General Jenny).
const VOICE = process.env.DEMO_TTS_VOICE || "en-US-AvaNeural";
const VOICE_RATE = process.env.DEMO_TTS_RATE || "+0%";
const OUT_MP4 = path.join(REPO_ROOT, "public/demo/eventclaim-portal-demo.mp4");
const OUT_VTT = path.join(REPO_ROOT, "public/demo/eventclaim-portal-demo.vtt");
const DRAFT_DIR = path.join(REPO_ROOT, "public/demo/draft");
const STORAGE_STATE = path.join(__dirname, "storageState.json");
const RECORDING_SECRET = process.env.PORTAL_DEMO_RECORDING_SECRET;

const SECTIONS = [
  {
    id: "01-welcome",
    kind: "title",
    title: "EventClaim",
    subtitle: "Cursor Community portal walkthrough",
    text: "Welcome to EventClaim, the Cursor Community portal for distributing partner credits at events.",
  },
  {
    id: "02-setup-intro",
    route: "/settings",
    wait: "settings",
    text: "Before you run an event, complete the most important step: set up Luma and EmailJS in Settings.",
  },
  {
    id: "03-setup-guide",
    route: "/settings/guide",
    wait: "guide",
    text: "Open the Setup guide for step-by-step instructions. Add your Luma API key to sync checked-in guests, then connect EmailJS so claim emails can be sent.",
  },
  {
    id: "04-settings-fields",
    route: "/settings",
    wait: "settings",
    text: "Save those values here. They stay encrypted in this browser only. Once configured, you are ready to create events.",
  },
  {
    id: "05-dashboard",
    route: "/dashboard",
    wait: "dashboard",
    text: "The dashboard gives a quick overview across events — attendees, coupons, emails sent, and claim rate.",
  },
  {
    id: "06-events",
    route: "/events",
    wait: "events",
    text: "Open Events to browse meetups or create a new one.",
  },
  {
    id: "07-overview-a",
    route: `/events/${SLUG}`,
    wait: "overview",
    text: "Each event opens on Overview. Here you see live stats for attendees, offer types, emails sent, and claim rate, plus shortcuts into the rest of the workflow.",
  },
  {
    id: "07-overview-b",
    route: `/events/${SLUG}`,
    wait: "overview",
    interact: "scroll-config",
    text: "Scroll down for event configuration. Set the Notion claim guide, edit the claim page hero, and review status controls for draft, active, or completed.",
  },
  {
    id: "07-overview-autosend",
    route: `/events/${SLUG}`,
    wait: "overview",
    interact: "autosend",
    text: "Auto-send emails is essential. Turn it on so attendees are emailed automatically as soon as they receive their coupon — no manual sending needed for each guest.",
  },
  {
    id: "08-import",
    route: `/events/${SLUG}/import`,
    wait: "import",
    text: "CSV import is optional — only if Luma sync is unavailable.",
  },
  {
    id: "09-attendees-a",
    route: `/events/${SLUG}/attendees`,
    wait: "attendees",
    text: "Attendees is where you will spend most of your time. Search and filter guests, and see coupon, email, and claim status together.",
  },
  {
    id: "10-attendees-b",
    route: `/events/${SLUG}/attendees`,
    wait: "attendees",
    interact: "scroll-attendees",
    text: "Send, resend, or retry claim emails from the table. Open any guest for detail, and blacklist addresses you do not want to email.",
  },
  {
    id: "11-temp-users",
    route: `/events/${SLUG}/attendees`,
    wait: "attendees",
    interact: "temp-users",
    text: "While the event is still in draft, create temp users with fake Cursor Credits links to verify claim emails before you go live.",
  },
  {
    id: "12-attendees-c",
    route: `/events/${SLUG}/attendees`,
    wait: "attendees",
    text: "After an event, this page is your source of truth for who was invited, emailed, and who already claimed.",
  },
  {
    id: "13-coupons-a",
    route: `/events/${SLUG}/coupons`,
    wait: "coupons",
    text: "Partner Offers is the other screen you will use most. Manage each partner coupon and track available versus granted links.",
  },
  {
    id: "14-coupons-b",
    route: `/events/${SLUG}/coupons/cpn_demo_credits`,
    wait: "coupon-detail",
    text: "Open an offer to review inventory, assigned attendees, and confirm the right credits went out.",
  },
  {
    id: "15-coupons-c",
    route: `/events/${SLUG}/coupons`,
    wait: "coupons",
    text: "Keep offers organized here before and during the event so claim emails always have inventory ready.",
  },
  {
    id: "16-audit",
    route: "/audit",
    wait: "audit",
    text: "Audit Logs keep a short history of imports, emails, and claims.",
  },
  {
    id: "17-close",
    kind: "title",
    title: "EventClaim",
    subtitle: "Set up once. Run every event with confidence.",
    text: "That is EventClaim. Set up Luma and EmailJS first, verify with temp users, use Overview auto-send, then run the event from Attendees and Partner Offers. Thanks for watching.",
  },
];

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} failed:\n${r.stderr || r.stdout}`);
  }
  return r;
}

function probeDuration(file) {
  return parseFloat(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        file,
      ],
      { encoding: "utf8" }
    ).trim()
  );
}

function formatVttTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const whole = Math.floor(s);
  const ms = Math.round((s - whole) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function splitSentences(text) {
  const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  return parts.map((p) => p.trim()).filter(Boolean);
}

async function pause(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function generateAudio() {
  fs.mkdirSync(path.join(WORK, "audio"), { recursive: true });
  const meta = [];
  let cursor = 0;
  for (const section of SECTIONS) {
    const mp3 = path.join(WORK, "audio", `${section.id}.mp3`);
    const txt = path.join(WORK, "audio", `${section.id}.txt`);
    fs.writeFileSync(txt, section.text);
    sh(EDGE, [
      "--voice",
      VOICE,
      "--rate",
      VOICE_RATE,
      "--file",
      txt,
      "--write-media",
      mp3,
    ]);
    const duration = probeDuration(mp3);
    meta.push({
      ...section,
      mp3,
      duration,
      start: cursor,
      end: cursor + duration,
    });
    cursor += duration;
    console.log(`${section.id}: ${duration.toFixed(2)}s`);
  }

  const listFile = path.join(WORK, "audio", "concat.txt");
  fs.writeFileSync(
    listFile,
    meta.map((m) => `file '${m.mp3}'`).join("\n")
  );
  const narration = path.join(WORK, "narration.mp3");
  sh("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-c",
    "copy",
    narration,
  ]);

  // Sentence-weighted cues keep captions aligned with spoken phrasing.
  const vttLines = ["WEBVTT", "", "NOTE EventClaim portal demo captions", ""];
  let cueIndex = 1;
  for (const m of meta) {
    const sentences = splitSentences(m.text);
    const totalChars = sentences.reduce((a, s) => a + s.length, 0) || 1;
    let t = m.start;
    for (const sentence of sentences) {
      const share = sentence.length / totalChars;
      const end = Math.min(m.end, t + share * m.duration);
      vttLines.push(String(cueIndex++));
      vttLines.push(`${formatVttTime(t)} --> ${formatVttTime(end)}`);
      vttLines.push(sentence, "");
      t = end;
    }
  }

  const vttPath = path.join(WORK, "narration.vtt");
  fs.writeFileSync(vttPath, vttLines.join("\n"));
  fs.writeFileSync(path.join(WORK, "sections.json"), JSON.stringify(meta, null, 2));
  return { meta, narration, vttPath, totalDuration: cursor };
}

async function assertNoSkeleton(page) {
  // Fail the section if any loading skeleton/spinner is still visible.
  const skeletonVisible = page.locator(
    ".animate-pulse:visible, [data-slot='skeleton']:visible"
  );
  if ((await skeletonVisible.count()) > 0) {
    throw new Error("Skeleton still visible — refusing to record loading state");
  }
  const spinnerVisible = page.locator(".animate-spin:visible");
  if ((await spinnerVisible.count()) > 0) {
    throw new Error("Spinner still visible — refusing to record loading state");
  }
}

async function waitForSection(page, section) {
  switch (section.wait) {
    case "settings":
      // Updated Settings UI labels the Luma field "API Key" (card title is Luma API).
      await page.locator("#luma-api-key").waitFor({ state: "visible", timeout: 20000 });
      await page.getByText("Luma API", { exact: true }).waitFor({
        state: "visible",
        timeout: 20000,
      });
      break;
    case "guide":
      await page.getByRole("heading", { name: /Integration Setup Guide/i }).waitFor({
        timeout: 20000,
      });
      break;
    case "dashboard":
      await page.getByText("Total Events").waitFor({ state: "visible", timeout: 20000 });
      await page.getByText("Cursor Community Meetup").waitFor({ timeout: 20000 });
      break;
    case "events":
      await page.getByText("Cursor Community Meetup").waitFor({ timeout: 20000 });
      break;
    case "overview":
      // Require real overview content — not the event-detail loading skeleton
      // (which also has four cards + tab pills and previously leaked into cuts).
      await page
        .getByRole("heading", { name: "Cursor Community Meetup" })
        .waitFor({ state: "visible", timeout: 20000 });
      await page.getByText("Auto-send emails").waitFor({ state: "visible", timeout: 20000 });
      await page.getByText("Claim Rate").waitFor({ state: "visible", timeout: 20000 });
      await page
        .getByRole("navigation", { name: /Event sections/i })
        .getByRole("link", { name: /Overview/i })
        .waitFor({ state: "visible", timeout: 20000 });
      break;
    case "import":
      await page.getByText(/Import Attendees from Luma/i).waitFor({ timeout: 20000 });
      break;
    case "attendees":
      await page.locator("table").first().waitFor({ state: "visible", timeout: 20000 });
      await page.getByRole("row", { name: /Alex Rivera/i }).first().waitFor({
        state: "visible",
        timeout: 20000,
      });
      break;
    case "coupons":
      await page.getByText("Cursor Credits", { exact: true }).first().waitFor({
        timeout: 20000,
      });
      break;
    case "coupon-detail":
      await page.getByText("Cursor Credits", { exact: true }).first().waitFor({
        timeout: 20000,
      });
      break;
    case "audit":
      await page.getByText(/event_created|Event created|Audit/i).first().waitFor({
        timeout: 20000,
      });
      break;
    default:
      break;
  }
  await pause(400);
  await assertNoSkeleton(page);
}

async function seedBrowserSettings(page) {
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.locator("#luma-api-key").waitFor({ state: "visible", timeout: 20000 });

  async function fill(id, value) {
    const input = page.locator(`#${id}`);
    await input.fill(value);
  }

  await fill("luma-api-key", "secret-demo-luma-key-for-recording");
  await fill("emailjs-service-id", "service_demo");
  await fill("emailjs-template-id", "template_demo");
  await fill("emailjs-public-key", "user_demo_public_key");
  await fill("emailjs-private-key", "demo_private_key_xxxxxxxx");
  // Use a polished public-looking URL in the recording (not localhost).
  await fill("app-base-url", "https://eventclaim.example.com");

  const save = page.getByRole("button", { name: /Save settings/i });
  await save.waitFor({ state: "visible", timeout: 10000 });
  // Wait until validation enables the button.
  await page.waitForFunction(
    () => {
      const buttons = [...document.querySelectorAll("button")];
      const btn = buttons.find((b) => /Save settings/i.test(b.textContent || ""));
      return Boolean(btn && !btn.disabled);
    },
    { timeout: 10000 }
  );
  await save.click();
  await page
    .getByText(/Settings saved locally/i)
    .first()
    .waitFor({ timeout: 10000 })
    .catch(() => {});
  await pause(500);
}

function buildRecordingStorageState() {
  if (!RECORDING_SECRET) {
    throw new Error(
      `Missing ${STORAGE_STATE}. Either run save-storage-state.cjs (Google sign-in) ` +
        `or set PORTAL_DEMO_RECORDING_SECRET for headless recording (no login UI).`
    );
  }
  const url = new URL(BASE);
  return {
    cookies: [
      {
        name: "eventclaim_session",
        value: `recording:${RECORDING_SECRET}`,
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      },
    ],
    origins: [],
  };
}

async function loadAuthAndSeedSettings(browser) {
  let stored;
  if (fs.existsSync(STORAGE_STATE)) {
    stored = JSON.parse(fs.readFileSync(STORAGE_STATE, "utf8"));
  } else {
    stored = buildRecordingStorageState();
    console.log(
      "Using PORTAL_DEMO_RECORDING_SECRET session (no Google storageState.json)"
    );
  }
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: stored,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => /\/dashboard\/?$/.test(url.pathname), {
    timeout: 20000,
  });
  await page.getByText("Total Events").waitFor({ timeout: 20000 });
  await seedBrowserSettings(page);
  const state = await context.storageState();
  await context.close();
  return state;
}

function renderTitleCard(outPath, title, subtitle, duration) {
  // Brand-forward title card — no UI chrome, no demo-login button.
  const escape = (s) =>
    String(s)
      .replace(/\\/g, "\\\\")
      .replace(/:/g, "\\:")
      .replace(/'/g, "\\'");
  const filter = [
    `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${escape(title)}':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h/2)-60`,
    `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='${escape(subtitle)}':fontcolor=0xC4B5FD:fontsize=28:x=(w-text_w)/2:y=(h/2)+20`,
  ].join(",");

  sh("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x1E1033:s=1280x800:d=${duration.toFixed(3)}:r=25`,
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-an",
    outPath,
  ]);
}

async function interact(page, section) {
  if (section.interact === "scroll-config" || section.interact === "autosend") {
    await page.getByText("Auto-send emails").scrollIntoViewIfNeeded();
    await pause(400);
  }
  if (section.interact === "autosend") {
    const toggle = page.getByRole("switch", { name: /Toggle auto-send emails/i });
    if (await toggle.count()) {
      const checked = await toggle.getAttribute("aria-checked");
      if (checked !== "true") {
        await toggle.click();
        await pause(900);
      } else {
        await toggle.click();
        await pause(600);
        await toggle.click();
        await pause(700);
      }
    }
  }
  if (section.interact === "scroll-attendees") {
    await page.mouse.wheel(0, 220);
    await pause(400);
  }
  if (section.interact === "temp-users") {
    const btn = page.getByRole("button", { name: /Create temp users/i });
    await btn.waitFor({ state: "visible", timeout: 15000 });
    await btn.scrollIntoViewIfNeeded();
    await pause(300);
    await btn.click();
    await page.getByRole("heading", { name: /Create temp users/i }).waitFor({
      timeout: 10000,
    });
    await pause(600);
  }
}

async function recordSection(browser, storageState, section, outPath) {
  if (section.kind === "title") {
    renderTitleCard(outPath, section.title, section.subtitle, section.duration);
    console.log(`${section.id}: title card ${section.duration.toFixed(2)}s`);
    return;
  }

  const dir = path.join(WORK, "clips", section.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState,
    recordVideo: { dir, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);

  await page.goto(`${BASE}${section.route}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await waitForSection(page, section);
  await interact(page, section);
  await assertNoSkeleton(page);

  // Hold ready UI longer than narration, then take the last `need` seconds so
  // navigation/skeleton frames at the start cannot enter the cut.
  const readyPadMs = 2000;
  await pause(Math.max(1000, section.duration * 1000) + readyPadMs);
  await assertNoSkeleton(page);

  const vid = await page.video().path();
  await context.close();

  const rawDur = probeDuration(vid);
  const need = section.duration;
  // Prefer the end of the recording (ready UI), drop startup navigation.
  // Output seeking (-ss after -i) is accurate; input -ss can land on an earlier
  // keyframe and leak loading skeletons into the start of overview clips.
  const ss = Math.max(0, rawDur - need - 0.05);
  sh("ffmpeg", [
    "-y",
    "-i",
    vid,
    "-ss",
    ss.toFixed(3),
    "-t",
    need.toFixed(3),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-an",
    outPath,
  ]);

  // Spot-check the first frame of the trimmed clip for leftover skeletons.
  const probeFrame = path.join(WORK, "clips", `${section.id}-probe.jpg`);
  sh("ffmpeg", [
    "-y",
    "-i",
    outPath,
    "-ss",
    "0.15",
    "-frames:v",
    "1",
    probeFrame,
  ]);
  console.log(
    `${section.id}: clip=${probeDuration(outPath).toFixed(2)}s need=${need.toFixed(2)} ss=${ss.toFixed(2)}/${rawDur.toFixed(2)} ${section.route}`
  );
}

async function main() {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(path.join(WORK, "clips"), { recursive: true });
  fs.mkdirSync(DRAFT_DIR, { recursive: true });

  // Archive current live demo before replacing (never overwrite existing drafts).
  if (fs.existsSync(OUT_MP4)) {
    const stamp = new Date().toISOString().slice(0, 10);
    let archive = path.join(DRAFT_DIR, `eventclaim-portal-demo-archive-${stamp}.mp4`);
    let n = 1;
    while (fs.existsSync(archive)) {
      archive = path.join(
        DRAFT_DIR,
        `eventclaim-portal-demo-archive-${stamp}-${n++}.mp4`
      );
    }
    fs.copyFileSync(OUT_MP4, archive);
    console.log("Archived previous live demo to", archive);
    if (fs.existsSync(OUT_VTT)) {
      fs.copyFileSync(OUT_VTT, archive.replace(/\.mp4$/, ".vtt"));
    }
  }

  const { meta, narration, vttPath } = await generateAudio();
  fs.copyFileSync(vttPath, OUT_VTT);

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });
  const storageState = await loadAuthAndSeedSettings(browser);

  const list = [];
  for (const section of meta) {
    const out = path.join(WORK, "clips", `${section.id}.mp4`);
    await recordSection(browser, storageState, section, out);
    list.push(out);
  }
  await browser.close();

  const concat = path.join(WORK, "concat.txt");
  fs.writeFileSync(concat, list.map((f) => `file '${f}'`).join("\n"));
  const silent = path.join(WORK, "silent.mp4");
  // Re-encode concat for timestamp continuity (copy can fail across clips).
  sh("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concat,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-an",
    silent,
  ]);

  const av = path.join(WORK, "av.mp4");
  sh("ffmpeg", [
    "-y",
    "-i",
    silent,
    "-i",
    narration,
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-shortest",
    "-movflags",
    "+faststart",
    av,
  ]);

  // Soft caption track (mov_text) + external VTT for the HTML5 player.
  sh("ffmpeg", [
    "-y",
    "-i",
    av,
    "-i",
    vttPath,
    "-map",
    "0",
    "-map",
    "1",
    "-c",
    "copy",
    "-c:s",
    "mov_text",
    "-metadata:s:s:0",
    "language=eng",
    "-disposition:s:0",
    "default",
    "-movflags",
    "+faststart",
    OUT_MP4,
  ]);

  const overview = meta
    .filter((m) => m.id.startsWith("07-"))
    .reduce((a, m) => a + m.duration, 0);
  const att = meta
    .filter((m) => m.id.includes("attendees") || m.id.includes("temp-users"))
    .reduce((a, m) => a + m.duration, 0);
  const off = meta
    .filter((m) => m.id.includes("coupons"))
    .reduce((a, m) => a + m.duration, 0);
  console.log("OUT", OUT_MP4, probeDuration(OUT_MP4).toFixed(2));
  console.log(
    `timing overview=${overview.toFixed(1)}s attendees+temp=${att.toFixed(1)}s offers=${off.toFixed(1)}s total=${meta.reduce((a, m) => a + m.duration, 0).toFixed(1)}s`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
