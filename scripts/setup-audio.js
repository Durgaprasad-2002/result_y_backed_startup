import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.resolve(__dirname, "../backend/storage/audio");

const SAMPLES = {
  pop: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  chill: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
  epic: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3",
  hyper: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3",
};

async function setup() {
  await mkdir(AUDIO_DIR, { recursive: true });
  for (const [name, url] of Object.entries(SAMPLES)) {
    console.log(`Downloading ${name} sample...`);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      await writeFile(
        path.join(AUDIO_DIR, `${name}.mp3`),
        Buffer.from(await res.arrayBuffer()),
      );
      console.log(`Saved ${name}.mp3`);
    } catch (err) {
      console.error(`Failed to download ${name}:`, err.message);
    }
  }
}

setup();
