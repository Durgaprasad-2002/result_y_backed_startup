import { readFile } from "node:fs/promises";

export async function fetchTrendingMemes() {
  try {
    const res = await fetch("https://api.imgflip.com/get_memes");
    const json = await res.json();
    return json.success ? json.data.memes : [];
  } catch (err) {
    console.error("Failed to fetch trending memes:", err);
    return [];
  }
}

export async function fetchTrendingMusic() {
  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/mhollingshead/billboard-hot-100/main/recent.json",
    );
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    console.error("Failed to fetch trending music:", err);
    return [];
  }
}

export function selectBestMeme(memes, brief) {
  if (!memes.length) return null;
  const mood = brief.gifMood.toLowerCase();

  // Try to find a meme whose name matches the mood
  const match = memes.find(
    (m) =>
      mood.includes(m.name.toLowerCase()) ||
      m.name.toLowerCase().includes(mood),
  );
  if (match) return match.url;

  // Fallback map for common moods
  if (mood.includes("spectacular") || mood.includes("success"))
    return memes.find((m) => m.name.includes("Drake"))?.url || memes[0].url;
  if (mood.includes("choice") || mood.includes("button"))
    return memes.find((m) => m.name.includes("Buttons"))?.url;
  if (mood.includes("distracted") || mood.includes("focus"))
    return memes.find((m) => m.name.includes("Boyfriend"))?.url;

  return memes[Math.floor(Math.random() * 10)].url; // Pick one from top 10
}

export function selectBestMusic(music, brief) {
  if (!music.length) return null;
  const mood = brief.audioMood.toLowerCase();

  // Pick top 1 if no specific match
  const top = music[0];
  return {
    song: top.song,
    artist: top.artist,
    // We'll map this to a style for now, since we don't have direct MP3s for Billboard hits
    style: mood.includes("hyper")
      ? "hyper"
      : mood.includes("chill")
        ? "chill"
        : "pop",
  };
}
