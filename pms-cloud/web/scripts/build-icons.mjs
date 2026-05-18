import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const iconsDir = resolve(root, 'public', 'icons');
const svgPath = resolve(root, 'public', 'taj-logo.svg');

if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });

const svg = readFileSync(svgPath);

const sizes = [192, 512];
const padding = 0.15;

async function generate() {
  for (const size of sizes) {
    const padded = Math.round(size * (1 - padding));
    const offset = Math.round((size - padded) / 2);

    const png = await sharp(svg)
      .resize(padded, padded, { fit: 'contain', background: { r: 244, g: 251, b: 251, alpha: 1 } })
      .extend({ top: offset, bottom: offset, left: offset, right: offset, background: { r: 244, g: 251, b: 251, alpha: 1 } })
      .png()
      .toBuffer();

    const outPath = resolve(iconsDir, `icon-${size}.png`);
    await sharp(png).toFile(outPath);
    console.log(`Created ${outPath}`);
  }

  // Maskable (safe zone: 80% of container)
  for (const size of sizes) {
    const safeZone = 0.8;
    const padded = Math.round(size * safeZone * (1 - padding));
    const offset = Math.round((size - padded) / 2);

    const png = await sharp(svg)
      .resize(padded, padded, { fit: 'contain', background: { r: 28, g: 95, b: 111, alpha: 1 } })
      .extend({ top: offset, bottom: offset, left: offset, right: offset, background: { r: 28, g: 95, b: 111, alpha: 1 } })
      .png()
      .toBuffer();

    const outPath = resolve(iconsDir, `icon-${size}-maskable.png`);
    await sharp(png).toFile(outPath);
    console.log(`Created ${outPath}`);
  }

  console.log('Icons generated.');
}

generate().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
