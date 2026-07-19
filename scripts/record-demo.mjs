import { spawn } from "node:child_process";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const appUrl = process.env.DEMO_APP_URL || "https://verisignal-agent.vercel.app";
const outputDir = resolve("docs/media");
const tempDir = resolve("tmp/demo-video");
const voiceDir = join(tempDir, "voice");
const rawVideo = join(tempDir, "verisignal.raw.webm");
const narration = join(tempDir, "verisignal-narration.wav");
const concatList = join(tempDir, "voice-list.txt");
const finalVideo = join(outputDir, "verisignal-demo.mp4");
const finalSubtitles = join(outputDir, "verisignal-demo.srt");
const edgePython = resolve("../agentpay-firewall/tmp/edge-tts-venv/bin/python");
const voice = process.env.DEMO_TTS_VOICE || "en-US-AndrewMultilingualNeural";

const segments = [
  {
    minDuration: 8,
    voiceover: "Most trading bots can tell you what they did. The harder question is whether anyone can prove why they did it.",
  },
  {
    minDuration: 12,
    voiceover: "VeriSignal is an autonomous strategy desk for trading and market operations teams. It turns official TxLINE odds and scores into bounded, reproducible paper decisions.",
  },
  {
    minDuration: 16,
    voiceover: "This showcase fetches an official historical TxLINE window at runtime, so judges can reproduce the flow after the match. Forty-two thousand five hundred sixty-four source records feed the derived probability curve.",
  },
  {
    minDuration: 18,
    voiceover: "No operator clicks approve. The agent watches every interval, rejects stale or incomplete markets, aligns price movement with the score, and waits for a twelve-point consensus shock to persist before it can enter.",
  },
  {
    minDuration: 18,
    voiceover: "Here England jumps twenty-three point nine five percentage points after the score moves to nil-two. One confirming interval passes every gate, and quarter-Kelly sizing caps the paper position at two hundred dollars.",
  },
  {
    minDuration: 18,
    voiceover: "This ENTER receipt carries the TxLINE message ID, every policy check, the previous hash, and its own decision hash. The same input and policy always reconstruct the same audit head.",
  },
  {
    minDuration: 20,
    voiceover: "The server also retrieves TxLINE's Merkle proof and simulates the official validateOdds instruction on Solana devnet. Program return passes, with proof depth nineteen and three hundred two thousand nine hundred forty-seven compute units.",
  },
  {
    minDuration: 16,
    voiceover: "Four valid ticks later, the take-profit rule exits automatically. The reference bankroll records sixty-six dollars and thirty-eight cents of realized paper profit, with no human intervention.",
  },
  {
    minDuration: 16,
    voiceover: "A production agent must also know when not to trade. When TxLINE reports a suspended or incomplete quote, VeriSignal creates a HALT receipt and marks the failed completeness gate instead of guessing.",
  },
  {
    minDuration: 19,
    voiceover: "The strategy core is a pure state machine. Feed freshness, score context, drawdown budget, quarter-Kelly sizing, and exit bands are deterministic, unit tested, and separated from the future venue execution adapter.",
  },
  {
    minDuration: 12,
    voiceover: "VeriSignal makes autonomy accountable: official data in, bounded action out, and proof attached. Built for the TxODDS Trading Tools and Agents track.",
  },
];

const pause = (milliseconds) => new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));

const run = (command, args, options = {}) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(command, args, {
    cwd: resolve("."),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  child.on("error", rejectRun);
  child.on("close", (code) => {
    if (code === 0) resolveRun({ stdout, stderr });
    else rejectRun(new Error(`${command} failed with code ${code}\n${stdout}\n${stderr}`));
  });
});

const probeDuration = async (filePath) => {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filePath,
  ]);
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid media: ${filePath}`);
  return duration;
};

const synthesize = async (textPath, audioPath) => {
  try {
    await run(edgePython, [
      "-m", "edge_tts", "--voice", voice, "--rate", "-3%", "--file", textPath,
      "--write-media", audioPath,
    ]);
  } catch {
    const fallback = audioPath.replace(/\.mp3$/, ".aiff");
    await run("say", ["-v", "Samantha", "-r", "160", "-f", textPath, "-o", fallback]);
    return fallback;
  }
  return audioPath;
};

const prepareNarration = async () => {
  const timed = [];
  await mkdir(voiceDir, { recursive: true });
  for (const [index, segment] of segments.entries()) {
    const key = String(index + 1).padStart(2, "0");
    const textPath = join(voiceDir, `${key}.txt`);
    const mediaPath = join(voiceDir, `${key}.mp3`);
    const paddedPath = join(voiceDir, `${key}.wav`);
    await writeFile(textPath, `${segment.voiceover}\n`);
    const sourcePath = await synthesize(textPath, mediaPath);
    const audioDuration = await probeDuration(sourcePath);
    const duration = Number(Math.max(segment.minDuration, audioDuration + 0.7).toFixed(3));
    await run("ffmpeg", [
      "-y", "-i", sourcePath,
      "-af", `apad=pad_dur=${Math.max(0, duration - audioDuration).toFixed(3)},atrim=0:${duration},asetpts=N/SR/TB`,
      "-ar", "48000", "-ac", "1", paddedPath,
    ]);
    timed.push({ ...segment, duration, paddedPath });
  }
  await writeFile(concatList, `${timed.map((segment) => `file '${segment.paddedPath.replaceAll("'", "'\\''")}'`).join("\n")}\n`);
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatList, "-c:a", "pcm_s16le", narration]);
  return timed;
};

const srtTime = (seconds) => {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
};

const buildSrt = (timed) => {
  let cursor = 0;
  return `${timed.map((segment, index) => {
    const start = cursor;
    cursor += segment.duration;
    return `${index + 1}\n${srtTime(start)} --> ${srtTime(cursor)}\n${segment.voiceover}\n`;
  }).join("\n")}\n`;
};

const installSceneStyles = async (page) => page.addStyleTag({ content: `
  #demo-caption { position: fixed; left: 50%; bottom: 24px; z-index: 100001; width: min(1240px, calc(100vw - 80px)); transform: translateX(-50%); box-sizing: border-box; padding: 12px 18px; border: 1px solid rgba(255,255,255,.32); border-radius: 6px; color: #fff; background: rgba(12, 18, 15, .93); font: 700 19px/1.35 Inter, ui-sans-serif, system-ui, sans-serif; text-align: center; box-shadow: 0 8px 28px rgba(0,0,0,.24); }
  #demo-scene { position: fixed; inset: 0; z-index: 100000; display: flex; flex-direction: column; justify-content: center; padding: 76px 96px 110px; box-sizing: border-box; color: #f6f9f7; background: #101713; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  #demo-scene::before { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px); background-size: 42px 42px; }
  #demo-scene > * { position: relative; }
  #demo-scene .eyebrow { display: flex; align-items: center; gap: 9px; color: #b5ef48; font-size: 17px; font-weight: 850; text-transform: uppercase; }
  #demo-scene .eyebrow::before { content: ""; width: 32px; height: 3px; background: #b5ef48; }
  #demo-scene h1 { max-width: 1140px; margin: 18px 0 20px; font-size: 68px; line-height: 1.02; letter-spacing: 0; }
  #demo-scene p { max-width: 920px; margin: 0; color: #bbc7c0; font-size: 25px; line-height: 1.45; }
  #demo-scene .proof-line { display: flex; gap: 10px; margin-top: 36px; }
  #demo-scene .proof-line span { padding: 11px 14px; color: #d7e0da; border: 1px solid #445048; border-radius: 5px; font: 750 15px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
  #demo-scene .state-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 30px; }
  #demo-scene .state { min-height: 135px; padding: 20px; background: #18221c; border-top: 3px solid #59665e; }
  #demo-scene .state b { display: block; margin-bottom: 12px; color: #f2f6f3; font-size: 23px; }
  #demo-scene .state span { color: #aebbb3; font-size: 16px; line-height: 1.4; }
  #demo-scene .state.signal { border-color: #c88a1d; }
  #demo-scene .state.execute { border-color: #16845d; }
  #demo-scene .state.prove { border-color: #2b73d2; }
  #demo-scene .state.halt { border-color: #db5b45; }
  #demo-scene .result { color: #b5ef48; }
` });

const showScene = async (page, kind) => page.evaluate((sceneKind) => {
  document.getElementById("demo-scene")?.remove();
  const scene = document.createElement("section");
  scene.id = "demo-scene";
  if (sceneKind === "intro") {
    scene.innerHTML = `<span class="eyebrow">VeriSignal / autonomous strategy desk</span><h1>Why did the agent act?</h1><p>Every decision should carry its data, risk checks, and proof.</p><div class="proof-line"><span>TxLINE input</span><span>Deterministic policy</span><span>Solana proof</span></div>`;
  } else if (sceneKind === "architecture") {
    scene.innerHTML = `<span class="eyebrow">Production-shaped autonomy</span><h1>One state machine. Explicit risk boundaries.</h1><div class="state-grid"><div class="state signal"><b>ARM</b><span>12-point shock plus score context</span></div><div class="state execute"><b>ENTER / EXIT</b><span>Quarter-Kelly, 2% cap, fixed exit bands</span></div><div class="state prove"><b>RECEIPT</b><span>TxLINE message, hash chain, Solana proof</span></div><div class="state halt"><b>HALT</b><span>Stale feed, incomplete quote, or drawdown</span></div></div>`;
  } else {
    scene.innerHTML = `<span class="eyebrow">VeriSignal</span><h1>Autonomy, with <span class="result">receipts.</span></h1><p>Official data in. Bounded action out. Proof attached.</p><div class="proof-line"><span>verisignal-agent.vercel.app</span><span>TxODDS Trading Tools &amp; Agents</span></div>`;
  }
  document.body.appendChild(scene);
}, kind);

const hideScene = async (page) => page.evaluate(() => document.getElementById("demo-scene")?.remove());

const showCaption = async (page, text) => page.evaluate((captionText) => {
  let caption = document.getElementById("demo-caption");
  if (!caption) {
    caption = document.createElement("div");
    caption.id = "demo-caption";
    document.body.appendChild(caption);
  }
  caption.textContent = captionText;
}, text);

const step = async (page, timed, index, action) => {
  const started = Date.now();
  await showCaption(page, timed[index].voiceover);
  if (action) await action();
  const remaining = timed[index].duration * 1000 - (Date.now() - started);
  if (remaining < -250) throw new Error(`Demo segment ${index + 1} exceeded its audio slot by ${Math.abs(remaining).toFixed(0)}ms`);
  if (remaining > 0) await pause(remaining);
};

const record = async (timed) => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      recordVideo: { dir: tempDir, size: { width: 1600, height: 900 } },
    });
    const page = await context.newPage();
    await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByText("TXLINE CONNECTED", { exact: true }).waitFor({ timeout: 60_000 });
    await page.getByRole("button", { name: /ENTER #/ }).waitFor({ timeout: 20_000 });
    await installSceneStyles(page);

    await step(page, timed, 0, () => showScene(page, "intro"));
    await step(page, timed, 1, async () => {
      await hideScene(page);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    });
    await step(page, timed, 2, async () => {
      await page.locator(".metric-strip").scrollIntoViewIfNeeded();
    });
    await step(page, timed, 3, async () => {
      await page.getByRole("button", { name: "Restart replay" }).click();
      await page.locator(".execution-tape").scrollIntoViewIfNeeded();
    });
    await step(page, timed, 4, async () => {
      await page.getByRole("button", { name: /ENTER #/ }).click();
      await page.locator(".receipt-action").scrollIntoViewIfNeeded();
    });
    await step(page, timed, 5, async () => {
      await page.locator(".hash-block").scrollIntoViewIfNeeded();
    });
    await step(page, timed, 6, async () => {
      await page.locator(".proof-block").scrollIntoViewIfNeeded();
    });
    await step(page, timed, 7, async () => {
      await page.getByRole("button", { name: /EXIT #/ }).click();
      await page.locator(".receipt-action").scrollIntoViewIfNeeded();
    });
    await step(page, timed, 8, async () => {
      await page.getByRole("button", { name: /HALT #/ }).click();
      await page.locator(".receipt-action").scrollIntoViewIfNeeded();
    });
    await step(page, timed, 9, () => showScene(page, "architecture"));
    await step(page, timed, 10, () => showScene(page, "outro"));

    const video = page.video();
    await context.close();
    if (!video) throw new Error("Playwright did not create a video");
    await copyFile(await video.path(), rawVideo);
  } finally {
    await browser?.close();
  }
};

await rm(tempDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await mkdir(tempDir, { recursive: true });

const timed = await prepareNarration();
const duration = timed.reduce((total, segment) => total + segment.duration, 0);
await writeFile(finalSubtitles, buildSrt(timed));
await record(timed);
const recordedDuration = await probeDuration(rawVideo);
const visualLead = Math.max(0, recordedDuration - duration);

const videoCodecArgs = process.platform === "darwin"
  ? ["-c:v", "h264_videotoolbox", "-b:v", "4200k", "-maxrate", "6000k", "-profile:v", "high"]
  : ["-c:v", "libx264", "-preset", "fast", "-crf", "18"];

await run("ffmpeg", [
  "-y", "-ss", visualLead.toFixed(3), "-i", rawVideo, "-i", narration,
  "-vf", "fps=30,format=yuv420p,tpad=stop_mode=clone:stop_duration=12",
  "-t", duration.toFixed(3), "-map", "0:v:0", "-map", "1:a:0",
  "-af", "loudnorm=I=-16:TP=-1.5:LRA=8", ...videoCodecArgs,
  "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", finalVideo,
]);

console.log(`Video: ${finalVideo}`);
console.log(`Subtitles: ${finalSubtitles}`);
console.log(`Duration: ${duration.toFixed(1)} seconds`);
console.log(`Voice: ${voice}`);
console.log(`Visual lead trimmed: ${visualLead.toFixed(3)} seconds`);
