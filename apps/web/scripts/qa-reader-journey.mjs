/* Local component journey only: simulated access/position API, generated PCM.
 * Run from the repo: node apps/web/scripts/qa-reader-journey.mjs [--serve]
 * No provider, database, purchase, authentication or offline-cache operations.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.env.READER_QA_OUTPUT || path.join(app, "test-results/reader-journey");

function wave(seconds) {
  const buffer = Buffer.alloc(44 + 8000 * 2 * seconds);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(buffer.length - 44, 40);
  return buffer;
}

async function main() {
  const bundle = await build({
    absWorkingDir: app,
    stdin: {
      contents: `import React, {useState} from 'react';
        import {createRoot} from 'react-dom/client';
        import Chapter from './src/app/(reader-browse)/reader/read/[chapterId]/ChapterAudiobookPlayer';
        import Body from './src/app/(reader-browse)/reader/read/[chapterId]/components/ReaderChapterBody';
        function Fixture() {
          const [chapter, setChapter] = useState('one');
          const [visible, setVisible] = useState(true);
          return <main className="mx-auto max-w-2xl p-4">
            <h1 className="text-2xl font-semibold">Local reader journey</h1>
            <p className="my-4 text-sm">Controlled component fixture. Access and saved positions are simulated. Text/audio synchronization is unavailable. Offline remains disabled.</p>
            <nav className="mb-4 flex flex-wrap gap-2" aria-label="Fixture chapter navigation">
              {['one','two'].map(id => <button key={id} className="min-h-11 rounded-lg border px-3" onClick={()=>{setChapter(id);setVisible(true);}}>Chapter {id}</button>)}
              <button className="min-h-11 rounded-lg border px-3" onClick={()=>setVisible(v=>!v)}>{visible?'Close player':'Continue listening'}</button>
            </nav>
            <Body chapterTitle={'Chapter '+chapter} chapterContent={'<p>Controlled text for chapter '+chapter+'. This passage has no generated timing manifest and is not highlighted during playback.</p>'} bodyStyle={{}} />
            {visible && <Chapter bookId="fixture-book" chapterId={chapter} audiobookStatus="ready" />}
          </main>;
        }
        createRoot(document.getElementById('root')).render(<Fixture />);`,
      resolveDir: app, loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "fixture-feature-flag", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/flags$/ }, () => ({ path: "flags", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const getAudiobookEnabled=()=>true;" }));
    } }],
  });
  const cssPath = path.join(app, "src/app/globals.css");
  const css = await postcss([tailwind({ base: app })]).process(fs.readFileSync(cssPath, "utf8"), { from: cssPath });
  const positions = new Map([["one", 20], ["two", 35]]);
  const writes = [];
  let accessStatus = 200;
  let emptyAudio = false;
  const audio = wave(180);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    res.setHeader("Cache-Control", "no-store");
    if (url.pathname.endsWith("/audiobook/progress")) {
      let body = "";
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      writes.push(data);
      positions.set(data.chapterId, data.positionSeconds);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, saved: true }));
    } else if (url.pathname.endsWith("/audiobook/play")) {
      res.statusCode = accessStatus;
      res.setHeader("Content-Type", "application/json");
      const chapter = url.searchParams.get("chapterId");
      res.end(JSON.stringify(accessStatus === 200
        ? { audioUrl: emptyAudio ? null : `/test.wav?chapter=${chapter}`, resumePositionSeconds: positions.get(chapter) ?? null }
        : { error: accessStatus === 401 ? "UNAUTHORIZED" : "FORBIDDEN" }));
    } else if (url.pathname === "/test.wav") {
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Accept-Ranges", "bytes");
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "");
      if (range) {
        const start = Number(range[1]);
        const end = range[2] ? Math.min(Number(range[2]), audio.length - 1) : audio.length - 1;
        res.statusCode = 206;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${audio.length}`);
        res.setHeader("Content-Length", end - start + 1);
        res.end(audio.subarray(start, end + 1));
      } else { res.setHeader("Content-Length", audio.length); res.end(audio); }
    } else if (url.pathname === "/bundle.js") {
      res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].contents);
    } else if (url.pathname === "/style.css") {
      res.setHeader("Content-Type", "text/css"); res.end(css.css);
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body class="bg-background text-foreground"><div id="root"></div><script src="/bundle.js"></script></body></html>');
    }
  });
  await new Promise(resolve => server.listen(Number(process.env.READER_QA_PORT || 0), "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  if (process.argv.includes("--serve")) { console.log(`SIMULATED BACKEND / REAL COMPONENTS: ${url}`); return; }
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const results = [];
  const media = page.locator("audio");
  const play = () => media.evaluate(el => el.play());
  const seek = async value => {
    await media.evaluate((el, position) => { el.pause(); el.currentTime = position; }, value);
    await expect.poll(() => media.evaluate(el => el.seeking)).toBe(false);
  };
  try {
    await page.goto(url);
    await expect(page.getByText("Resume from 0:20")).toBeVisible();
    await page.getByLabel("Playback speed").selectOption("1.5");
    await play();
    await expect.poll(() => media.evaluate(el => el.currentTime)).toBeGreaterThanOrEqual(20);
    expect(await media.evaluate(el => el.playbackRate)).toBe(1.5);
    results.push("Real player/hook restores simulated 20s position; 1.5x survives loadedmetadata.");

    await seek(70);
    await expect.poll(() => positions.get("one")).toBe(70);
    await page.getByRole("button", { name: "Chapter two", exact: true }).click();
    await expect(page.getByText("Resume from 0:35")).toBeVisible();
    await play();
    await expect.poll(() => media.evaluate(el => el.currentTime)).toBeGreaterThanOrEqual(35);
    await seek(50);
    await page.getByRole("button", { name: "Chapter one", exact: true }).click();
    await expect.poll(() => positions.get("two")).toBe(50);
    await expect(page.getByText("Resume from 1:10")).toBeVisible();
    await play();
    await expect.poll(() => media.evaluate(el => el.currentTime)).toBeGreaterThanOrEqual(70);
    results.push("Chapter changes flush prior chapter and restore each chapter's own position.");

    await seek(0);
    await page.getByRole("button", { name: "Close player", exact: true }).click();
    await expect.poll(() => positions.get("one")).toBe(0);
    await page.getByRole("button", { name: "Continue listening", exact: true }).click();
    await expect(page.getByText("Chapter playback", { exact: true })).toBeVisible();
    await play();
    expect(await media.evaluate(el => el.currentTime)).toBeLessThan(5);
    results.push("Rewind to zero followed by immediate close/reopen retains the intentional restart.");

    await page.clock.install();
    await page.getByLabel("Sleep timer").selectOption("5");
    await page.clock.fastForward(300001);
    await expect(page.getByRole("status")).toContainText("Sleep timer ended");
    expect(await media.evaluate(el => el.paused)).toBe(true);
    await play();
    expect(await media.evaluate(el => el.paused)).toBe(false);
    await page.getByLabel("Sleep timer").selectOption("5");
    await page.getByLabel("Sleep timer").selectOption("0");
    await page.clock.fastForward(300001);
    await expect(page.getByRole("status")).not.toContainText("Sleep timer ended");
    results.push("Accelerated wall-clock sleep timer pauses; manual play resumes; Off cancels expiry.");
    await media.evaluate(el => { el.pause(); el.dispatchEvent(new Event("error")); });
    await expect(page.getByRole("alert")).toContainText("Could not play this audio");
    await page.getByRole("button", { name: "Retry audio" }).click();
    await expect(page.getByLabel("Playback speed")).toBeVisible();
    results.push("Synthetic media error gives visible retry through the real chapter URL loader.");

    await page.screenshot({ path: path.join(output, "reader-mobile.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const label of ["Playback speed", "Sleep timer"]) {
      expect(await page.getByLabel(label).evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: path.join(output, "reader-desktop.png"), fullPage: true });
    results.push("Real application CSS: 390px no horizontal overflow and 44px selectors; desktop 1280px captured.");

    for (const status of [401, 403]) {
      accessStatus = status;
      await page.reload();
      await expect(page.getByRole("alert")).toContainText(status === 401 ? "Sign in again" : "does not have access");
      await expect(media).toHaveCount(0);
    }
    accessStatus = 200;
    await page.getByRole("button", { name: "Retry audio" }).click();
    await expect(media).toHaveCount(1);
    emptyAudio = true;
    await page.reload();
    await expect(page.getByRole("status")).toContainText("No audio is available");
    results.push("Simulated 401/403 explain access denial without playing; retry and empty state work.");
    expect(errors).toEqual([]);
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ url, evidence: "local real components; simulated backend; no text synchronization", results, writes, errors }, null, 2));
    console.log(JSON.stringify({ results, errors, output }, null, 2));
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
