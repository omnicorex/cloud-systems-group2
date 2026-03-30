/**
 * extract-frames.js
 * Extracts video frames as JPEGs using the bundled ffmpeg-static binary.
 * Run once: node extract-frames.js
 */

const ffmpegPath = require('ffmpeg-static');
const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const INPUT  = path.join(__dirname, 'public', 'videos', 'house-network-exploding-view.mp4');
const OUTPUT = path.join(__dirname, 'public', 'frames');

if (!fs.existsSync(OUTPUT)) {
  fs.mkdirSync(OUTPUT, { recursive: true });
  console.log('Created output directory:', OUTPUT);
}

// ── 1. Probe: get duration and native fps ────────────────────────────────────
const probeResult = spawnSync(ffmpegPath, [
  '-v', 'quiet',
  '-print_format', 'json',
  '-show_streams',
  '-select_streams', 'v:0',
  INPUT,
], { encoding: 'utf8' });

// ffmpeg-static bundles ffprobe separately; fall back to ffmpeg stderr probe
const probe2 = spawnSync(ffmpegPath, ['-i', INPUT], { encoding: 'utf8' });
const stderrText = probe2.stderr || '';
const durationMatch = stderrText.match(/Duration:\s*([\d:.]+)/);
const fpsMatch      = stderrText.match(/([\d.]+)\s*fps/);

let durationSec = 10; // safe default
let nativeFps   = 30;

if (durationMatch) {
  const parts = durationMatch[1].split(':').map(Number);
  durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  console.log(`Duration: ${durationSec.toFixed(2)}s`);
}
if (fpsMatch) {
  nativeFps = parseFloat(fpsMatch[1]);
  console.log(`Native FPS: ${nativeFps}`);
}

// ── 2. Decide extraction fps ─────────────────────────────────────────────────
// Target ~100-120 frames total for smooth but light-weight animation.
// Clamp between 12 and 30 fps.
const TARGET_FRAMES = 120;
const extractFps = Math.min(30, Math.max(12, Math.round(TARGET_FRAMES / durationSec)));
const estimatedFrames = Math.round(durationSec * extractFps);

console.log(`Extracting at ${extractFps} fps → ~${estimatedFrames} frames`);
console.log('Output:', OUTPUT);
console.log('This may take a moment…\n');

// ── 3. Extract ───────────────────────────────────────────────────────────────
// scale=1200:-2  →  1200px wide, height auto-rounded to even number
// -q:v 4         →  JPEG quality (1=best/largest … 31=worst/smallest); 4 is high quality
const result = spawnSync(ffmpegPath, [
  '-i',     INPUT,
  '-vf',    `fps=${extractFps},scale=1200:-2`,
  '-q:v',   '4',
  '-f',     'image2',
  path.join(OUTPUT, 'frame_%04d.jpg'),
], { encoding: 'utf8', stdio: 'inherit' });

if (result.status !== 0) {
  console.error('\nffmpeg exited with status', result.status);
  process.exit(1);
}

// ── 4. Report ────────────────────────────────────────────────────────────────
const files  = fs.readdirSync(OUTPUT).filter(f => f.endsWith('.jpg'));
const totalKB = files.reduce((acc, f) => acc + fs.statSync(path.join(OUTPUT, f)).size, 0) / 1024;

console.log(`\n✓  Extracted ${files.length} frames`);
console.log(`   Total size: ${(totalKB / 1024).toFixed(2)} MB`);
console.log(`   Avg per frame: ${(totalKB / files.length).toFixed(0)} KB`);
console.log(`\nUpdate FRAME_COUNT = ${files.length} in index.html`);
