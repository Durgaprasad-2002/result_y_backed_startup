import axios from "axios";
import * as cheerio from "cheerio";

const URL_PATTERN =
  /(https?:\/\/[^\s)]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)]*)?)/i;

export function extractUrl(text) {
  const match = text.match(URL_PATTERN);
  if (!match) return null;
  const raw = match[0].replace(/[.,!?]+$/, "");
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

export async function readProductPage(url) {
  if (!url) return null;

  try {
    const { data: html } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (UGC-Pipeline-Bot)" },
      timeout: 15000,
    });
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr("content") ||
      $("title").text().trim();
    const description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      "";

    const bodyText = $("body")
      .find("p, li, h1, h2, h3")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join(" ")
      .slice(0, 6000);

    const images = [];
    $("img").each((_, el) => {
      let src = $(el).attr("src") || $(el).attr("data-src");
      if (!src) return;
      try {
        src = new URL(src, url).toString();
        if (/\.(jpe?g|png|webp)(\?|$)/i.test(src)) images.push(src);
      } catch (_) {}
    });

    return {
      title: title || "",
      description: description || "",
      bodyText,
      images: [...new Set(images)].slice(0, 8),
      sourceUrl: url,
    };
  } catch (error) {
    console.error("Scraping failed:", error.message);
    return {
      title: new URL(url).hostname.replace(/^www\./, ""),
      description: "Scraping failed.",
      bodyText: "",
      images: [],
      sourceUrl: url,
    };
  }
}
