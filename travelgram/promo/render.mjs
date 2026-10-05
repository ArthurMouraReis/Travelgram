// Renderiza promo.html quadro a quadro e gera travelgram-promo-15s.mp4 com ffmpeg.
// Uso: node render.mjs [--fps 30] [--out travelgram-promo-15s.mp4] [--frames 0,90,200 (só gera PNGs de prévia)]
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : def;
};
const fps = Number(arg("fps", 30));
const out = path.resolve(dir, arg("out", "travelgram-promo-15s.mp4"));
const previewFrames = arg("frames", null);

const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--allow-file-access-from-files"],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(pathToFileURL(path.join(dir, "promo.html")).href + "?capture");
await page.evaluate(() => window.ready);
const duration = await page.evaluate(() => window.DURATION);
const stage = await page.$("#stage");

if (previewFrames) {
    for (const f of previewFrames.split(",").map(Number)) {
        await page.evaluate((t) => window.render(t), f / fps);
        await stage.screenshot({ path: path.resolve(arg("dir", dir), `frame-${String(f).padStart(3, "0")}.png`) });
    }
    await browser.close();
    process.exit(0);
}

const ffmpeg = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "20",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    out,
], { stdio: ["pipe", "inherit", "inherit"] });

const total = Math.round(duration * fps);
for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.render(t), f / fps);
    const buf = await stage.screenshot({ type: "png" });
    if (!ffmpeg.stdin.write(buf)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
    if (f % fps === 0) process.stdout.write(`\r${f}/${total} quadros`);
}
ffmpeg.stdin.end();
await new Promise((r, j) => ffmpeg.on("close", (c) => (c === 0 ? r() : j(new Error(`ffmpeg saiu com ${c}`)))));
await browser.close();
console.log(`\nPronto: ${out}`);
