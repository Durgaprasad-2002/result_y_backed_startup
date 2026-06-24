import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuidv4 } from "uuid";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { prisma } from "./prisma.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.resolve(__dirname, "../storage");
const VIDEOS_DIR = path.join(STORAGE_DIR, "videos");
const PUBLIC_API_URL =
  process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4000}`;

if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

// ---------------------------------------------------------------------------
// STEP 3: Generate voiceover audio per scene (ElevenLabs TTS).
// ---------------------------------------------------------------------------
async function generateVoiceover(text, outFile) {
  if (!ELEVENLABS_API_KEY) return null; // signal: use silent fallback

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      text,
      model_id: "eleven_monolingual_v1",
      voice_settings: { stability: 0.4, similarity_boost: 0.8 },
    },
    {
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      responseType: "arraybuffer",
    },
  );

  fs.writeFileSync(outFile, response.data);
  return outFile;
}

function getAudioDurationSeconds(file) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 4);
    });
  });
}

// ---------------------------------------------------------------------------
// STEP 4: Download a real product image, or build a generated placeholder
// ---------------------------------------------------------------------------
async function downloadImage(url, outFile) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 10000,
  });
  fs.writeFileSync(outFile, response.data);
  return outFile;
}

function buildPlaceholderImage(text, outFile) {
  return new Promise((resolve, reject) => {
    const safeText = text.replace(/[^A-Za-z0-9\s!?.\-]/g, "").slice(0, 60);
    ffmpeg()
      .input("color=c=0x1a1a2e:s=1080x1920:d=1")
      .inputFormat("lavfi")
      .outputOptions(["-frames:v", "1"])
      .videoFilters([
        `drawtext=text='${safeText}':fontcolor=white:fontsize=54:x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=10`,
      ])
      .save(outFile)
      .on("end", () => resolve(outFile))
      .on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// STEP 5: Build one scene clip
// ---------------------------------------------------------------------------
function buildSceneClip({
  imageFile,
  audioFile,
  durationSec,
  captionText,
  outFile,
}) {
  return new Promise((resolve, reject) => {
    const safeCaption = captionText
      .replace(/[^A-Za-z0-9\s!?.\-]/g, "")
      .slice(0, 80);
    const cmd = ffmpeg().input(imageFile).loop(durationSec);

    if (audioFile) cmd.input(audioFile);

    const vfFilters = [
      "scale=1080:1920:force_original_aspect_ratio=increase",
      "crop=1080:1920",
      `drawtext=text='${safeCaption}':fontcolor=white:fontsize=46:box=1:boxcolor=black@0.5:boxborderw=12:x=(w-text_w)/2:y=h-300`,
    ];

    cmd
      .videoFilters(vfFilters)
      .outputOptions(["-t", String(durationSec), "-pix_fmt", "yuv420p"])
      .videoCodec("libx264");

    if (audioFile) {
      cmd.audioCodec("aac");
    } else {
      cmd.noAudio();
    }

    cmd
      .save(outFile)
      .on("end", () => resolve(outFile))
      .on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// STEP 6: Concatenate all scene clips
// ---------------------------------------------------------------------------
function concatClips(clipFiles, outFile, jobDir) {
  return new Promise((resolve, reject) => {
    const listFile = path.join(jobDir, "concat_list.txt");
    fs.writeFileSync(
      listFile,
      clipFiles.map((f) => `file '${path.resolve(f)}'`).join("\n"),
    );

    ffmpeg()
      .input(listFile)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .outputOptions(["-c", "copy"])
      .save(outFile)
      .on("end", () => resolve(outFile))
      .on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// MAIN PIPELINE ORCHESTRATOR
// ---------------------------------------------------------------------------
export async function generateUgcVideo({
  conversationId,
  pageData,
  script,
  onProgress,
}) {
  const jobId = uuidv4();
  const jobDir = path.join(STORAGE_DIR, "work", jobId);
  if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

  const log = (msg) => {
    console.log(`[${jobId}] ${msg}`);
    if (onProgress) onProgress({ status: "processing", message: msg });
  };

  log("Step 3/6: Building scenes (voiceover + visuals)...");
  const clipFiles = [];

  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const audioFile = path.join(jobDir, `scene_${i}.mp3`);
    const imageFile = path.join(jobDir, `scene_${i}.jpg`);
    const clipFile = path.join(jobDir, `clip_${i}.mp4`);

    if (onProgress) {
      onProgress({
        status: "building_scene",
        sceneIndex: i,
        totalScenes: script.scenes.length,
        sceneId: scene.id,
      });
    }

    // 3a. Voiceover
    const voiceResult = await generateVoiceover(
      scene.voiceover,
      audioFile,
    ).catch((e) => {
      log(
        `  voiceover failed for scene ${i}: ${e.message} (falling back to silence)`,
      );
      return null;
    });

    let durationSec = 4;
    let finalAudioFile = null;
    if (voiceResult) {
      finalAudioFile = voiceResult;
      durationSec = Math.max(3, await getAudioDurationSeconds(voiceResult));
    }

    // 3b. Visual — try a scraped product image first, else placeholder slide
    let visualReady = false;
    if (pageData.images && pageData.images[i]) {
      try {
        await downloadImage(pageData.images[i], imageFile);
        visualReady = true;
      } catch (e) {
        log(`  image download failed for scene ${i}: ${e.message}`);
      }
    }
    if (!visualReady) {
      try {
        await buildPlaceholderImage(
          scene.visual_idea || scene.on_screen_text,
          imageFile,
        );
      } catch (e) {
        log(`  placeholder image failed for scene ${i}: ${e.message}`);
        // Last resort fallback: a plain black image without text
        await new Promise((res, rej) => {
          ffmpeg()
            .input("color=c=black:s=1080x1920:d=1")
            .inputFormat("lavfi")
            .outputOptions(["-frames:v", "1"])
            .save(imageFile)
            .on("end", res)
            .on("error", rej);
        });
      }
    }

    // 3c. Compose the scene clip
    await buildSceneClip({
      imageFile,
      audioFile: finalAudioFile,
      durationSec,
      captionText: scene.on_screen_text || "",
      outFile: clipFile,
    });

    clipFiles.push(clipFile);
    log(`  scene ${i} (${scene.id}) done -> ${durationSec.toFixed(1)}s`);
  }

  log("Step 4/6: Concatenating scenes...");
  const outputName = `${jobId}.mp4`;
  const finalFile = path.join(VIDEOS_DIR, outputName);
  await concatClips(clipFiles, finalFile, jobDir);

  log("Step 5/6: Done.");

  const publicUrl = `${PUBLIC_API_URL}/videos/${outputName}`;

  try {
    await prisma.video.create({
      data: {
        conversationId,
        productUrl: pageData.sourceUrl,
        productName: script.product_name,
        hook: script.scenes[0]?.voiceover || "",
        fileName: outputName,
        publicUrl,
        metadata: { script },
      },
    });
  } catch (dbErr) {
    console.warn("DB save skipped:", dbErr.code, dbErr.meta);
  }

  return {
    jobId,
    fileName: outputName,
    publicUrl,
    script,
  };
}
