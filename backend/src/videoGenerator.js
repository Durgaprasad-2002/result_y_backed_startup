import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuidv4 } from "uuid";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import OpenAI from "openai";
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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateAIImage(productName, visualIdea, outFile) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "sk-xxxx")
    return null;

  try {
    const prompt = `Create a vibrant, high-quality promotional image for "${productName}". Scene: ${visualIdea}. Style: modern UGC ad, bright colors, clean, professional. No text overlays.`;

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1792",
      quality: "low",
    });

    const b64 = response.data[0].b64_json;
    if (b64) {
      fs.writeFileSync(outFile, Buffer.from(b64, "base64"));
      return outFile;
    }

    const imageUrl = response.data[0].url;
    if (imageUrl) {
      const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
      });
      fs.writeFileSync(outFile, imageResponse.data);
      return outFile;
    }

    return null;
  } catch (e) {
    console.warn(`AI image generation failed: ${e.message}`);
    return null;
  }
}

async function generateVoiceover(text, outFile) {
  if (!ELEVENLABS_API_KEY) return null;

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

function generateBackgroundMusic(outFile, durationSec) {
  return new Promise((resolve, reject) => {
    const bass = "0.18*sin(130.81*2*PI*t)*(1-min(1,mod(t*4,1)*8))";
    const chime = "0.10*sin(523.25*2*PI*t)*(1-min(1,mod(t*2+0.5,1)*10))";
    const pad = "0.07*sin(392*2*PI*t)*sin(PI*t*0.25)";
    const hihat = "0.04*random(0)*(1-min(1,mod(t*8,1)*12))";
    const expr = `${bass}+${chime}+${pad}+${hihat}`;

    ffmpeg()
      .input(`aevalsrc='${expr}':s=44100:d=${durationSec}`)
      .inputFormat("lavfi")
      .audioCodec("aac")
      .outputOptions(["-b:a", "128k"])
      .save(outFile)
      .on("end", () => resolve(outFile))
      .on("error", reject);
  });
}

function mixBackgroundMusic(videoFile, musicFile, outFile) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoFile)
      .input(musicFile)
      .complexFilter(["[1:a]volume=0.25,afade=t=out:st=-2:d=2[bg]"])
      .outputOptions([
        "-map",
        "0:v",
        "-map",
        "[bg]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",
      ])
      .save(outFile)
      .on("end", () => resolve(outFile))
      .on("error", reject);
  });
}

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

  log("Building scenes (visuals + voiceover)...");
  const clipFiles = [];

  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const audioFile = path.join(jobDir, `scene_${i}.mp3`);
    const imageFile = path.join(jobDir, `scene_${i}.png`);
    const clipFile = path.join(jobDir, `clip_${i}.mp4`);

    if (onProgress) {
      onProgress({
        status: "building_scene",
        sceneIndex: i,
        totalScenes: script.scenes.length,
        sceneId: scene.id,
      });
    }

    const voiceResult = await generateVoiceover(
      scene.voiceover,
      audioFile,
    ).catch((e) => {
      log(`Voiceover failed for scene ${i}: ${e.message}`);
      return null;
    });

    let durationSec = 4;
    let finalAudioFile = null;
    if (voiceResult) {
      finalAudioFile = voiceResult;
      durationSec = Math.max(3, await getAudioDurationSeconds(voiceResult));
    }

    let visualReady = false;

    if (!visualReady) {
      log(`Generating AI image for scene ${i}...`);
      const aiImage = await generateAIImage(
        script.product_name,
        scene.visual_idea,
        imageFile,
      );
      if (aiImage) {
        visualReady = true;
        log(`AI image ready for scene ${i}`);
      }
    }

    if (!visualReady && pageData.images && pageData.images[i]) {
      try {
        await downloadImage(pageData.images[i], imageFile);
        visualReady = true;
        log(`Scraped image used for scene ${i}`);
      } catch (e) {
        log(`Image download failed for scene ${i}: ${e.message}`);
      }
    }

    if (!visualReady) {
      try {
        await buildPlaceholderImage(
          scene.visual_idea || scene.on_screen_text,
          imageFile,
        );
      } catch (e) {
        log(`Placeholder image failed for scene ${i}: ${e.message}`);
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

    await buildSceneClip({
      imageFile,
      audioFile: finalAudioFile,
      durationSec,
      captionText: scene.on_screen_text || "",
      outFile: clipFile,
    });

    clipFiles.push(clipFile);
    log(`Scene ${i} (${scene.id}) done -> ${durationSec.toFixed(1)}s`);
  }

  const totalDuration = script.scenes.length * 4 + 2;

  log("Concatenating scenes...");
  const rawVideoName = `${jobId}_raw.mp4`;
  const rawVideoFile = path.join(jobDir, rawVideoName);
  await concatClips(clipFiles, rawVideoFile, jobDir);

  log("Adding background music...");
  const musicFile = path.join(jobDir, "bgm.m4a");
  const outputName = `${jobId}.mp4`;
  const finalFile = path.join(VIDEOS_DIR, outputName);

  try {
    await generateBackgroundMusic(musicFile, totalDuration);
    await mixBackgroundMusic(rawVideoFile, musicFile, finalFile);
    log("Background music added");
  } catch (e) {
    log(`Background music failed: ${e.message}, using video without music`);
    fs.copyFileSync(rawVideoFile, finalFile);
  }

  log("Done");

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
