/**
 * Demo focus helpers: border highlight on a single section (no zoom).
 * Used by build-portal-demo.cjs.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const VW = 1920;
const VH = 1080;
const FOCUS_FPS = 30;

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} failed:\n${r.stderr || r.stdout}`);
  }
  return r;
}

function even(n) {
  return Math.max(2, Math.floor(Number(n) / 2) * 2);
}

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Compute end crop box for a DOM rect, capped by zoom intensity.
 * @param {{x:number,y:number,width:number,height:number}} rect
 * @param {"tight"|"medium"} zoom
 */
function computeEndBox(rect, zoom = "medium") {
  const maxScale = zoom === "tight" ? 1.85 : 1.4;
  const pad = zoom === "tight" ? 24 : 48;

  let x = rect.x - pad;
  let y = rect.y - pad;
  let w = rect.width + pad * 2;
  let h = rect.height + pad * 2;

  const aspect = VW / VH;
  if (w / h > aspect) {
    const nh = w / aspect;
    y -= (nh - h) / 2;
    h = nh;
  } else {
    const nw = h * aspect;
    x -= (nw - w) / 2;
    w = nw;
  }

  const minW = VW / maxScale;
  const minH = VH / maxScale;
  if (w < minW) {
    const cx = x + w / 2;
    w = minW;
    x = cx - w / 2;
  }
  if (h < minH) {
    const cy = y + h / 2;
    h = minH;
    y = cy - h / 2;
  }

  w = Math.min(w, VW);
  h = Math.min(h, VH);
  x = Math.min(Math.max(0, x), VW - w);
  y = Math.min(Math.max(0, y), VH - h);

  return { x: even(x), y: even(y), w: even(w), h: even(h) };
}

async function applyDemoFocus(page, selector) {
  const found = await page.locator(selector).first().count();
  if (!found) {
    throw new Error(`Demo focus target not found: ${selector}`);
  }
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await pause(200);

  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`focus target missing in DOM: ${sel}`);

    document.getElementById("demo-focus-style")?.remove();
    const style = document.createElement("style");
    style.id = "demo-focus-style";
    style.textContent = `
      [data-demo-focus-active="1"] {
        position: relative !important;
        z-index: 2147483000 !important;
        border-radius: 12px;
        outline: 3px solid rgba(124, 58, 237, 0.95);
        outline-offset: 4px;
        box-shadow:
          0 0 0 2px rgba(255, 255, 255, 0.95),
          0 0 0 9999px rgba(12, 8, 22, 0.35) !important;
        transition: box-shadow 280ms ease, outline-color 280ms ease;
      }
    `;
    document.head.appendChild(style);

    document.querySelectorAll("[data-demo-focus-active]").forEach((node) => {
      node.removeAttribute("data-demo-focus-active");
    });
    el.setAttribute("data-demo-focus-active", "1");
  }, selector);

  // Establish / spotlight fade-in window
  await pause(420);
}

async function clearDemoFocus(page) {
  await page.evaluate(() => {
    document.querySelectorAll("[data-demo-focus-active]").forEach((node) => {
      node.removeAttribute("data-demo-focus-active");
    });
    document.getElementById("demo-focus-style")?.remove();
  });
}

async function measureFocusBox(page, selector, zoom = "medium") {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) {
    throw new Error(`Could not measure focus box for ${selector}`);
  }
  return computeEndBox(box, zoom);
}

/**
 * Hold a full-frame focused still/clip (border already burned into pixels).
 * No Ken Burns / crop-zoom — keeps header/footer and layout intact.
 */
function encodeFocusBorder(srcPath, outPath, duration, videoEncode) {
  const fps = FOCUS_FPS;
  const isPng = /\.png$/i.test(srcPath);
  const args = ["-y"];
  if (isPng) {
    args.push(
      "-loop",
      "1",
      "-i",
      srcPath,
      "-t",
      duration.toFixed(3),
      "-r",
      String(fps)
    );
  } else {
    args.push("-i", srcPath, "-t", duration.toFixed(3));
  }
  args.push(
    "-vf",
    `scale=${VW}:${VH}:flags=lanczos,fps=${fps}`,
    ...videoEncode,
    "-an",
    outPath
  );
  sh("ffmpeg", args);
}

/** @deprecated Use encodeFocusBorder — kept as alias during transition. */
function encodeFocusZoom(srcPath, outPath, _box, duration, videoEncode) {
  encodeFocusBorder(srcPath, outPath, duration, videoEncode);
}

/**
 * Rasterize Cursor wordmark SVG to PNG via Playwright (no ImageMagick required).
 */
async function ensureCursorLogoPng(browser, workDir, repoRoot) {
  const out = path.join(workDir, "cursor-logo.png");
  if (fs.existsSync(out)) return out;

  const svgPath = path.join(repoRoot, "public/partner-logos/cursor_logo.svg");
  if (!fs.existsSync(svgPath)) {
    throw new Error(`Missing Cursor logo at ${svgPath}`);
  }
  let svg = fs.readFileSync(svgPath, "utf8");
  // Force explicit size for crisp rasterization
  if (!/\swidth=/.test(svg)) {
    svg = svg.replace(
      "<svg",
      '<svg width="800" height="190"'
    );
  }

  const context = await browser.newContext({
    viewport: { width: 880, height: 220 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.setContent(
    `<!DOCTYPE html>
<html>
<body style="margin:0;background:transparent;display:flex;align-items:center;justify-content:center;width:880px;height:220px;">
${svg}
</body>
</html>`,
    { waitUntil: "load" }
  );
  const logo = page.locator("svg").first();
  await logo.waitFor({ state: "visible", timeout: 5000 });
  await logo.screenshot({ path: out, omitBackground: true });
  await context.close();
  return out;
}

/**
 * Title/end card with Cursor logo above title + subtitle.
 */
function renderTitleCardWithLogo(
  outPath,
  title,
  subtitle,
  duration,
  logoPng,
  videoEncode
) {
  const escape = (s) =>
    String(s)
      .replace(/\\/g, "\\\\")
      .replace(/:/g, "\\:")
      .replace(/'/g, "\\'");

  // Logo ~480px wide, centered above title (1920x1080)
  const filter = [
    `[1:v]scale=480:-1:flags=lanczos,format=rgba[logo]`,
    `[0:v][logo]overlay=(W-w)/2:280,` +
      `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${escape(title)}':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=520,` +
      `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='${escape(subtitle)}':fontcolor=0xC4B5FD:fontsize=32:x=(w-text_w)/2:y=620`,
  ].join(";");

  sh("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x1E1033:s=${VW}x${VH}:d=${duration.toFixed(3)}:r=25`,
    "-i",
    logoPng,
    "-filter_complex",
    filter,
    ...videoEncode,
    "-an",
    outPath,
  ]);
}

module.exports = {
  FOCUS_FPS,
  VW,
  VH,
  applyDemoFocus,
  clearDemoFocus,
  measureFocusBox,
  computeEndBox,
  encodeFocusBorder,
  encodeFocusZoom,
  ensureCursorLogoPng,
  renderTitleCardWithLogo,
  pause,
};
