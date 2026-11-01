// The title of a YouTube video, from YouTube's public "oEmbed" address (no key
// or account needed). Null if it can't be had quickly.
export async function youtubeTitle(videoUrl: string): Promise<string | null> {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(videoUrl)}`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const title = ((await response.json()) as { title?: string }).title?.trim();
    return title ? title.slice(0, 120) : null;
  } catch {
    return null;
  }
}
