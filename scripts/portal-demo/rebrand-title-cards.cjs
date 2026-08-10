#!/usr/bin/env node
/**
 * Offline title/end-card rebrand for the portal demo.
 * Replaces purple title cards with Cursor ink (#26251E) + warm neutrals,
 * top-left layout, and Cursor lockup — without Playwright/DB.
 *
 * Usage:
 *   DEMO_SOURCE=/path/to/source.mp4 node scripts/portal-demo/rebrand-title-cards.cjs
 * Default source: git HEAD version of the live demo mp4 (via temporary extract),
 * or DEMO_SOURCE / public/demo/eventclaim-portal-demo.mp4
 */
const fs = require("fs");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");
const { renderTitleCardWithLogo } = require("./focus-zoom.cjs");

const REPO = path.join(__dirname, "../..");
const LIVE_MP4 = path.join(REPO, "public/demo/eventclaim-portal-demo.mp4");
const LIVE_VTT = path.join(REPO, "public/demo/eventclaim-portal-demo.vtt");
const DRAFT = path.join(REPO, "public/demo/draft");
const WORK = "/tmp/demo-rebrand-title-cards";
const VIDEO_ENCODE = [
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "14",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
];

const WELCOME_DUR = 5.952;
const CLOSE_START = 136.848;

function sh(cmd, args) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.stderr || r.stdout}`);
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
        "default=nw=1:nk=1",
        file,
      ],
      { encoding: "utf8" }
    ).trim()
  );
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function ensureCursorWordmarkPng() {
  const out = path.join(REPO, "public/brand/cursor-wordmark-light.png");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const svgSrc = path.join(REPO, "public/partner-logos/cursor_logo.svg");
  let svg = fs.readFileSync(svgSrc, "utf8");
  svg = svg.replace(/#edecec/gi, "#f7f7f4");
  if (!/\swidth=/.test(svg.split(">", 1)[0])) {
    svg = svg.replace("<svg", '<svg width="2239" height="532"');
  }
  const tmpSvg = path.join(WORK, "cursor-wordmark.svg");
  fs.writeFileSync(tmpSvg, svg);
  sh("ffmpeg", [
    "-y",
    "-width",
    "2239",
    "-height",
    "532",
    "-i",
    tmpSvg,
    "-frames:v",
    "1",
    "-update",
    "1",
    out,
  ]);
  return out;
}

function resolveSource() {
  if (process.env.DEMO_SOURCE && fs.existsSync(process.env.DEMO_SOURCE)) {
    return process.env.DEMO_SOURCE;
  }
  // Prefer git HEAD copy when available (clean purple-title original)
  const fromGit = path.join(WORK, "from-git.mp4");
  const r = spawnSync("git", ["show", "HEAD:public/demo/eventclaim-portal-demo.mp4"], {
    cwd: REPO,
    maxBuffer: 80 * 1024 * 1024,
  });
  if (r.status === 0 && r.stdout && r.stdout.length > 1000) {
    fs.writeFileSync(fromGit, r.stdout);
    return fromGit;
  }
  return LIVE_MP4;
}

function main() {
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(DRAFT, { recursive: true });

  const sourceMp4 = resolveSource();
  if (!fs.existsSync(sourceMp4)) {
    throw new Error(`Missing ${sourceMp4}`);
  }

  const total = probeDuration(sourceMp4);
  const closeDur = Math.max(0.5, total - CLOSE_START);
  console.log(
    `source=${sourceMp4} dur=${total.toFixed(3)}s welcome=${WELCOME_DUR}s close=${closeDur.toFixed(3)}s`
  );

  const logoPng = ensureCursorWordmarkPng();
  const welcomeOut = path.join(WORK, "welcome.mp4");
  const closeOut = path.join(WORK, "close.mp4");
  renderTitleCardWithLogo(
    welcomeOut,
    "EventClaim",
    "Cursor Community portal walkthrough",
    WELCOME_DUR,
    logoPng,
    VIDEO_ENCODE
  );
  renderTitleCardWithLogo(
    closeOut,
    "EventClaim",
    "Set up once. Run every event with confidence.",
    closeDur,
    logoPng,
    VIDEO_ENCODE
  );

  const spliced = path.join(WORK, "spliced.mp4");
  // One-pass: trim middle from source, concat with new cards, keep source audio
  const filter = [
    `[1:v]fps=25,setpts=PTS-STARTPTS[w]`,
    `[0:v]trim=start=${WELCOME_DUR}:end=${CLOSE_START},fps=25,setpts=PTS-STARTPTS[m]`,
    `[2:v]fps=25,setpts=PTS-STARTPTS[c]`,
    `[w][m][c]concat=n=3:v=1:a=0[v]`,
  ].join(";");

  sh("ffmpeg", [
    "-y",
    "-i",
    sourceMp4,
    "-i",
    welcomeOut,
    "-i",
    closeOut,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-map",
    "0:a:0",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "14",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    spliced,
  ]);

  const archiveBase = `eventclaim-portal-demo-archive-${stamp()}-brand`;
  if (fs.existsSync(LIVE_MP4)) {
    fs.copyFileSync(LIVE_MP4, path.join(DRAFT, `${archiveBase}.mp4`));
  }
  if (fs.existsSync(LIVE_VTT)) {
    fs.copyFileSync(LIVE_VTT, path.join(DRAFT, `${archiveBase}.vtt`));
  }

  fs.copyFileSync(spliced, LIVE_MP4);

  if (fs.existsSync(LIVE_VTT)) {
    let vtt = fs.readFileSync(LIVE_VTT, "utf8");
    vtt = vtt.replace(
      /Audit Logs keep a short history/g,
      "Audit logs keep a short history"
    );
    fs.writeFileSync(LIVE_VTT, vtt);
  }

  const outDur = probeDuration(LIVE_MP4);
  console.log(`Wrote ${LIVE_MP4} (${outDur.toFixed(3)}s); archived ${archiveBase}`);
}

main();
