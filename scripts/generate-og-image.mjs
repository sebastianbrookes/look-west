// Generates the social link preview (public/og.jpg) and the Apple touch icon
// (public/apple-touch-icon.png). Run with `npm run generate:og`.
//
// Designed for Apple Messages / Mail rich links, which show the image in a
// chat bubble about 264pt wide, so a 1200px canvas shrinks to roughly a fifth
// of its size. That's why the text is so large: anything under ~40px is
// unreadable in the bubble. Apple puts og:title and the domain under the
// image, so the image itself doesn't repeat the URL. The content is centered
// so it still works if a client crops the image to a narrower ratio.
import sharp from "sharp";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");

const WIDTH = 1200;
const HEIGHT = 630;

const FONTS = {
  "Shadows Into Light":
    "https://fonts.gstatic.com/s/shadowsintolight/v22/UqyNK9UOIntux_czAvDQx_ZcHqZXBNQDcg.ttf",
  Figtree:
    "https://fonts.gstatic.com/s/figtree/v9/_Xmz-HUzqDCFdgfMsYiV_F7wfS-Bs_dNQF5e.ttf", // 500
};

const CREAM = "#fffaf4";
const SHADOW = "rgba(80, 30, 5, 0.5)";

const fontDir = await mkdtemp(path.join(os.tmpdir(), "og-fonts-"));
try {
  console.log("Downloading fonts...");
  for (const [family, url] of Object.entries(FONTS)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Font download failed (${res.status}): ${url}`);
    const file = path.join(fontDir, `${family}.ttf`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    GlobalFonts.registerFromPath(file, family);
  }

  // Text layer: darkened center so cream text holds up on bright clouds
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  const wash = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 60, WIDTH / 2, HEIGHT / 2, 680);
  wash.addColorStop(0, "rgba(120, 50, 15, 0.32)");
  wash.addColorStop(1, "rgba(120, 50, 15, 0.06)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = CREAM;
  ctx.shadowColor = SHADOW;

  ctx.font = '230px "Shadows Into Light"';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 4;
  ctx.fillText("Look West", WIDTH / 2, 262);

  ctx.font = '500 50px "Figtree"';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 2;
  ctx.fillText("Sunset alerts, straight to your inbox", WIDTH / 2, 438);

  console.log("Generating public/og.jpg (1200×630)...");
  await sharp(path.join(PUBLIC, "background.webp"))
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "center" })
    .composite([{ input: canvas.toBuffer("image/png") }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(path.join(PUBLIC, "og.jpg"));

  // iOS/macOS use this icon for compact link previews and home-screen
  // bookmarks. Uses an opaque background because iOS fills transparency with black.
  console.log("Generating public/apple-touch-icon.png (180×180)...");
  const mark = await sharp(path.join(PUBLIC, "favicon.svg"), { density: 300 })
    .resize(132, 132)
    .png()
    .toBuffer();
  await sharp({
    create: { width: 180, height: 180, channels: 3, background: "#faf5ef" },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toFile(path.join(PUBLIC, "apple-touch-icon.png"));

  console.log("✅ Done");
} finally {
  await rm(fontDir, { recursive: true, force: true });
}
