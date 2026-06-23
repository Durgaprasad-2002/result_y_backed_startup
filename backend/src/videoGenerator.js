import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { prisma } from "./prisma.js";
import {
  fetchTrendingMemes,
  fetchTrendingMusic,
  selectBestMeme,
  selectBestMusic,
} from "./trendFetcher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.resolve(__dirname, "../storage");
const VIDEO_DIR = path.join(STORAGE_DIR, "videos");
const WORK_DIR = path.join(STORAGE_DIR, "work");
const PUBLIC_API_URL =
  process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4000}`;

const GIFS = {
  spectacular:
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdW5ia2R6YmJ6YmJ6YmJ6YmJ6YmJ6YmJ6YmJ6YmJ6YmJ6YmJ6JmVwPXYxX2dpZnNfc2VhcmNoJmN0PWc/5GoVLqeAOo6PK/giphy.gif",
  brat: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmFzazRwaGNqeHpsbnZ6NHB3YWU0eXN6eHpsJmVwPXYxX2dpZnNfc2VhcmNoJmN0PWc/pWIdm9oTzF3H6U9K4L/giphy.gif",
  freak:
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYnRhZ2RmcDl6YnBtbmZqNmZ6eXN6eHpsJmVwPXYxX2dpZnNfc2VhcmNoJmN0PWc/K2g1NuxgwfyP9iP2Bv/giphy.gif",
  pedro:
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHZ6NHB3YWU0eXN6eHpsbnZ6NHB3YWU0eXN6eHpsJmVwPXYxX2dpZnNfc2VhcmNoJmN0PWc/v6aOebdPMRPpY6vSR4/giphy.gif",
  excited:
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNmtjNHhvaGphbTZsMzg1Ymd1ZWZrOXc3bXVrZmY0MHltcnQwajMxNyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3o7abKhOpu0NwenH3O/giphy.gif",
};

const AUDIO_DIR_LOCAL = path.join(STORAGE_DIR, "audio");
const AUDIO = {
  pop: path.join(AUDIO_DIR_LOCAL, "pop.mp3"),
  chill: path.join(AUDIO_DIR_LOCAL, "chill.mp3"),
  epic: path.join(AUDIO_DIR_LOCAL, "epic.mp3"),
  hyper: path.join(AUDIO_DIR_LOCAL, "hyper.mp3"),
};

export async function generateUgcVideo({ conversationId, product, brief }) {
  await mkdir(VIDEO_DIR, { recursive: true });
  await mkdir(WORK_DIR, { recursive: true });

  const id = nanoid(10);
  const work = path.join(WORK_DIR, id);
  await mkdir(work, { recursive: true });

  const backgroundPath = path.join(work, "background.png");
  const overlayPath = path.join(work, "overlay.png");
  const gifPath = path.join(work, "reaction.gif");
  const audioPath = path.join(work, "audio.mp3");
  const outputName = `${id}.mp4`;
  const outputPath = path.join(VIDEO_DIR, outputName);

  // Dynamic trend fetching
  const [memes, music] = await Promise.all([
    fetchTrendingMemes(),
    fetchTrendingMusic(),
  ]);
  const memeUrl = selectBestMeme(memes, brief) || selectGif(brief);
  const trendMusic = selectBestMusic(music, brief);
  const audioUrl = AUDIO[trendMusic?.style] || selectAudio(brief);

  // Enhance brief with real trend info
  const enhancedBrief = {
    ...brief,
    trendingMusic: trendMusic
      ? `${trendMusic.song} by ${trendMusic.artist}`
      : null,
  };

  await createBackground({
    product,
    brief: enhancedBrief,
    outputPath: backgroundPath,
  });
  await createTextOverlay({
    product,
    brief: enhancedBrief,
    outputPath: overlayPath,
  });
  await downloadAsset(memeUrl, gifPath);
  await downloadAsset(audioUrl, audioPath);
  await renderVideo({
    backgroundPath,
    overlayPath,
    gifPath,
    audioPath,
    outputPath,
  });

  const publicUrl = `${PUBLIC_API_URL}/videos/${outputName}`;
  await prisma.video.create({
    data: {
      conversationId,
      productUrl: product?.url,
      productName: brief.productName,
      hook: brief.hook,
      fileName: outputName,
      publicUrl,
      metadata: { product, brief },
    },
  });

  return {
    productName: brief.productName,
    hook: brief.hook,
    fileName: outputName,
    publicUrl,
    metadata: { product, brief },
  };
}

async function createBackground({ product, brief, outputPath }) {
  const width = 1080;
  const height = 1920;
  const base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#121212",
    },
  });

  let productImage = null;
  if (product?.image) {
    try {
      const response = await fetch(product.image, {
        signal: AbortSignal.timeout(7000),
      });
      if (response.ok) productImage = Buffer.from(await response.arrayBuffer());
    } catch {
      productImage = null;
    }
  }

  const backgroundSvg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#111827"/>
          <stop offset="52%" stop-color="#164e63"/>
          <stop offset="100%" stop-color="#f97316"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <rect x="70" y="95" width="940" height="1730" rx="42" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)" stroke-width="3"/>
      <text x="100" y="1780" fill="rgba(255,255,255,0.72)" font-size="34" font-family="Arial">${escapeXml(product?.url || brief.productName)}</text>
    </svg>
  `);

  const composites = [{ input: backgroundSvg, top: 0, left: 0 }];

  if (productImage) {
    const image = await sharp(productImage)
      .resize(860, 860, { fit: "inside", withoutEnlargement: true })
      .modulate({ brightness: 0.9, saturation: 1.15 })
      .png()
      .toBuffer();
    composites.push({ input: image, gravity: "center" });
  }

  await base.composite(composites).png().toFile(outputPath);
}

async function createTextOverlay({ brief, outputPath }) {
  const lines = [brief.hook, ...brief.overlayLines].slice(0, 4);
  const lineSvg = lines
    .map((line, index) => {
      const y = 210 + index * 118;
      const size = index === 0 ? 64 : 52;
      return `
        <rect x="82" y="${y - 72}" width="${Math.min(915, 180 + line.length * 28)}" height="88" rx="28" fill="rgba(255,255,255,0.92)"/>
        <text x="122" y="${y - 14}" fill="#111827" font-size="${size}" font-weight="800" font-family="Arial">${escapeXml(line)}</text>
      `;
    })
    .join("");

  const svg = `
    <svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
      ${lineSvg}
      <rect x="96" y="1410" width="888" height="190" rx="34" fill="rgba(17,24,39,0.78)"/>
      <text x="132" y="1482" fill="#ffffff" font-size="46" font-weight="800" font-family="Arial">${escapeXml(brief.productName)}</text>
      <text x="132" y="1544" fill="#fef3c7" font-size="34" font-family="Arial">${escapeXml(brief.caption)}</text>
      ${brief.trendingMusic ? `<text x="132" y="1585" fill="#8ace00" font-size="24" font-weight="700" font-family="Arial">🎵 Trending: ${escapeXml(brief.trendingMusic)}</text>` : ""}
    </svg>
  `;

  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

function selectGif(brief) {
  const mood = `${brief.gifMood} ${brief.hook}`.toLowerCase();
  if (mood.includes("spectacular")) return GIFS.spectacular;
  if (mood.includes("brat")) return GIFS.brat;
  if (mood.includes("freak")) return GIFS.freak;
  if (mood.includes("pedro") || mood.includes("raccoon")) return GIFS.pedro;
  if (mood.includes("win") || mood.includes("excited")) return GIFS.excited;
  return GIFS.brat;
}

function selectAudio(brief) {
  const mood = `${brief.audioMood} ${brief.caption}`.toLowerCase();
  if (mood.includes("brat") || mood.includes("hyper")) return AUDIO.hyper;
  if (mood.includes("epic") || mood.includes("spectacular")) return AUDIO.epic;
  if (mood.includes("chill") || mood.includes("lofi")) return AUDIO.chill;
  return AUDIO.pop;
}

async function downloadAsset(urlOrPath, outputPath) {
  try {
    if (urlOrPath.startsWith("http")) {
      const response = await fetch(urlOrPath, {
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok)
        throw new Error(`Asset fetch failed: ${response.status}`);
      await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
    } else {
      // Local file
      const content = await readFile(urlOrPath);
      await writeFile(outputPath, content);
    }
  } catch {
    // If it's a GIF and it fails, try to use a fallback tiny gif
    if (outputPath.endsWith(".gif")) {
      const tinyGif = await readFile(path.resolve(__dirname, "tiny.gif")).catch(
        () => null,
      );
      if (tinyGif) await writeFile(outputPath, tinyGif);
      else
        await writeFile(
          outputPath,
          Buffer.from(
            "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
            "base64",
          ),
        );
    } else {
      // If audio fails, we'll just use a sine wave in renderVideo (handled by -f lavfi fallback if file missing?
      // Actually we'll just write an empty file and handle it in ffmpeg or provide a local fallback)
      await writeFile(outputPath, Buffer.from(""));
    }
  }
}

async function renderVideo({
  backgroundPath,
  overlayPath,
  gifPath,
  audioPath,
  outputPath,
}) {
  const args = [
    "-y",
    "-loop",
    "1",
    "-t",
    "8",
    "-i",
    backgroundPath,
    "-loop",
    "1",
    "-t",
    "8",
    "-i",
    gifPath, // Loop the overlay (works for both static and gif in newest ffmpeg with -t 8)
    "-loop",
    "1",
    "-t",
    "8",
    "-i",
    overlayPath,
    "-i",
    audioPath,
    "-filter_complex",
    "[1:v]scale=430:-1:force_original_aspect_ratio=decrease,format=rgba[gif];" +
      "[0:v][gif]overlay=x=(W-w)/2:y=820:shortest=1[bg];" +
      "[bg][2:v]overlay=0:0,format=yuv420p[v];" +
      "[3:a]volume=0.2,atrim=0:8,afade=t=out:st=7:d=1[a]",
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-shortest",
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  await runFfmpeg(args).catch(async (err) => {
    console.error(
      "FFmpeg primary render failed, falling back to sine audio:",
      err,
    );
    // Fallback if audio file is corrupted or missing
    const fallbackArgs = [
      "-y",
      "-loop",
      "1",
      "-t",
      "8",
      "-i",
      backgroundPath,
      "-loop",
      "1",
      "-t",
      "8",
      "-i",
      gifPath,
      "-i",
      overlayPath,
      "-f",
      "lavfi",
      "-t",
      "8",
      "-i",
      "sine=frequency=176:sample_rate=44100",
      "-filter_complex",
      "[1:v]scale=430:-1:force_original_aspect_ratio=decrease,format=rgba[gif];" +
        "[0:v][gif]overlay=x=(W-w)/2:y=820:shortest=1[bg];" +
        "[bg][2:v]overlay=0:0,format=yuv420p[v];" +
        "[3:a]volume=0.08[a]",
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-shortest",
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outputPath,
    ];
    await runFfmpeg(fallbackArgs);
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited with ${code}`));
    });
  });
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
