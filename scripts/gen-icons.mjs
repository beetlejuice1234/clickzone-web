// Regenerate the PWA PNG icons from the square source. Run: `node scripts/gen-icons.mjs`
// Chrome's install prompt needs PNG icons at 192 and 512; maskable needs a safe-zone padded 512.
import sharp from 'sharp';

const SRC = 'public/pwa-icon-1024.jpg'; // 1024x1024 square source
const BG = { r: 0, g: 0, b: 0, alpha: 1 }; // black, matches the app's dark theme

async function main() {
  await sharp(SRC).resize(192, 192, { fit: 'cover' }).png().toFile('public/pwa-192x192.png');
  await sharp(SRC).resize(512, 512, { fit: 'cover' }).png().toFile('public/pwa-512x512.png');
  await sharp(SRC).resize(180, 180, { fit: 'cover' }).png().toFile('public/apple-touch-icon-180.png');

  // Maskable: the icon must live inside the inner ~80% safe zone, padded to 512 on a solid canvas.
  const inner = await sharp(SRC).resize(410, 410, { fit: 'cover' }).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: BG } })
    .composite([{ input: inner, gravity: 'center' }])
    .png()
    .toFile('public/pwa-maskable-512x512.png');

  console.log('generated: pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png, apple-touch-icon-180.png');
}
main().catch((e) => { console.error(e); process.exit(1); });
