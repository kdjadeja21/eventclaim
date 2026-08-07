/**
 * Professional-grade demo focus helpers: spotlight + eased Ken Burns zoom.
 * Used by build-portal-demo.cjs.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const VW = 1280;
const VH = 800;
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
  const maxScale = zoom === "tight" ? 1.65 : 1.32;
  const pad = zoom === "tight" ? 36 : 56;

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
        outline: 3px solid rgba(255, 255, 255, 0.92);
        outline-offset: 3px;
        box-shadow: 0 0 0 9999px rgba(12, 8, 22, 0.55) !important;
        transition: box-shadow 380ms ease, outline-color 380ms ease;
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
 * Eased Ken Burns: establish → smoothstep zoom+pan → settle hold.
 * Renders at 2× then lanczos down for sharp UI text.
 */
function encodeFocusZoom(srcPath, outPath, box, duration, videoEncode) {
  const fps = FOCUS_FPS;
  const totalFrames = Math.max(Math.round(duration * fps), 12);
  const establish = Math.min(
    Math.round(0.4 * fps),
    Math.max(2, Math.floor(totalFrames * 0.12))
  );
  let zoomFrames = Math.min(
    Math.round(1.8 * fps),
    Math.floor(totalFrames * 0.35)
  );
  zoomFrames = Math.max(10, Math.min(zoomFrames, totalFrames - establish - 2));

  const endZ = VW / box.w;
  // Near full-frame: skip aggressive zoom
  if (endZ < 1.08) {
    const isPng = /\.png$/i.test(srcPath);
    const args = ["-y"];
    if (isPng) {
      args.push("-loop", "1", "-i", srcPath, "-t", duration.toFixed(3), "-r", String(fps));
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
    return;
  }

  const cx = (box.x + box.w / 2) / VW;
  const cy = (box.y + box.h / 2) / VH;
  const e0 = establish;
  const zf = zoomFrames;
  const e1 = e0 + zf;
  const endZs = endZ.toFixed(6);
  const cxs = cx.toFixed(6);
  const cys = cy.toFixed(6);

  // smoothstep: p in [0,1], s = p*p*(3-2*p)
  // commas escaped for -vf filtergraph
  const zExpr =
    `if(lt(on\\,${e0})\\,1\\,` +
    `if(gt(on\\,${e1})\\,${endZs}\\,` +
    `1+(${endZs}-1)*` +
    `((on-${e0})/${zf})*((on-${e0})/${zf})*` +
    `(3-2*((on-${e0})/${zf}))))`;
  const xExpr = `(iw-iw/zoom)*${cxs}`;
  const yExpr = `(ih-ih/zoom)*${cys}`;

  const isPng = /\.png$/i.test(srcPath);
  const args = ["-y"];
  if (isPng) {
    args.push("-loop", "1", "-i", srcPath, "-t", duration.toFixed(3));
    args.push(
      "-vf",
      [
        `scale=2560:1600:flags=lanczos`,
        `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=2560x1600:fps=${fps}`,
        `scale=${VW}:${VH}:flags=lanczos`,
      ].join(",")
    );
  } else {
    args.push("-i", srcPath, "-t", duration.toFixed(3));
    args.push(
      "-vf",
      [
        `fps=${fps}`,
        `scale=2560:1600:flags=lanczos`,
        `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=2560x1600:fps=${fps}`,
        `scale=${VW}:${VH}:flags=lanczos`,
      ].join(",")
    );
  }

  args.push(...videoEncode, "-an", outPath);
  sh("ffmpeg", args);
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

  // Logo ~360px wide, centered above title
  const filter = [
    `[1:v]scale=360:-1:flags=lanczos,format=rgba[logo]`,
    `[0:v][logo]overlay=(W-w)/2:210,` +
      `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${escape(title)}':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=410,` +
      `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='${escape(subtitle)}':fontcolor=0xC4B5FD:fontsize=26:x=(w-text_w)/2:y=490`,
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
  applyDemoFocus,
  clearDemoFocus,
  measureFocusBox,
  computeEndBox,
  encodeFocusZoom,
  ensureCursorLogoPng,
  renderTitleCardWithLogo,
  pause,
};
