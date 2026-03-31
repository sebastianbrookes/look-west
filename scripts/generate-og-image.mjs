import sharp from "sharp";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// OG image optimal dimensions
const WIDTH = 1200;
const HEIGHT = 630;

// Download the Shadows Into Light font
const fontUrl =
  "https://fonts.gstatic.com/s/shadowsintolight/v22/UqyNK9UOIntux_czAvDQx_ZcHqZXBNQDcg.ttf";
const fontPath = path.join(ROOT, "scripts", ".shadows-into-light.ttf");

console.log("Downloading Shadows Into Light font...");
execSync(`curl -s -o "${fontPath}" "${fontUrl}"`);

// Register font with canvas
GlobalFonts.registerFromPath(fontPath, "Shadows Into Light");

// Create canvas with text overlay
const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext("2d");

// Draw the "Look West" text
ctx.font = '120px "Shadows Into Light"';
ctx.textAlign = "center";
ctx.textBaseline = "middle";
ctx.fillStyle = "rgba(44, 24, 16, 0.85)"; // --text color with slight transparency
ctx.fillText("Look West", WIDTH / 2, HEIGHT / 2);

// Export text overlay as PNG buffer
const textBuffer = canvas.toBuffer("image/png");

console.log("Generating OG image (1200×630)...");

await sharp(path.join(ROOT, "public", "background.webp"))
  .resize(WIDTH, HEIGHT, { fit: "cover", position: "center" })
  .composite([{ input: textBuffer, top: 0, left: 0 }])
  .png({ quality: 90 })
  .toFile(path.join(ROOT, "public", "og.png"));

console.log("✅ Created public/og.png (1200×630)");

// Clean up font file
execSync(`rm "${fontPath}"`);
