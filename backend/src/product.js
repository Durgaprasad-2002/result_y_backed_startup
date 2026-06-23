import * as cheerio from "cheerio";

const URL_PATTERN = /(https?:\/\/[^\s)]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)]*)?)/i;

export function extractUrl(text) {
  const match = text.match(URL_PATTERN);
  if (!match) return null;
  const raw = match[0].replace(/[.,!?]+$/, "");
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

export async function readProductPage(url) {
  if (!url) return null;

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; ResultUGCBot/1.0; +https://example.com/bot)"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(9000)
    });

    const html = await response.text();
    const $ = cheerio.load(html);
    $("script, style, noscript, svg").remove();

    const meta = (name) =>
      $(`meta[property="${name}"]`).attr("content") ||
      $(`meta[name="${name}"]`).attr("content") ||
      "";

    const title = meta("og:title") || $("title").first().text() || new URL(url).hostname;
    const description =
      meta("og:description") ||
      meta("description") ||
      $("h1").first().text() ||
      $("body").text().replace(/\s+/g, " ").trim().slice(0, 240);
    const image = absolutize(meta("og:image") || meta("twitter:image"), url);
    const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 1800);

    return {
      url,
      title: clean(title),
      description: clean(description),
      image,
      bodyText
    };
  } catch (error) {
    return {
      url,
      title: new URL(url).hostname.replace(/^www\./, ""),
      description: "Product page could not be fetched, so the brief uses the URL and chat context.",
      image: null,
      bodyText: "",
      fetchError: error.message
    };
  }
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function absolutize(value, base) {
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}
