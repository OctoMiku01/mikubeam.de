// "Right now" box: live status from Twitch and the current song from Last.fm.
// Both are cached briefly in the Cloudflare cache; a source without credentials is simply skipped.

const CACHE = "https://cache.mikubeam.internal/now/";
const TWITCH_TTL_S = 60;
const LASTFM_TTL_S = 30;
// Song list (~0.5 s) plus at most 1 s artwork search for a new song must fit in here.
const TIMEOUT_MS = 2500;

async function cached(key, ttl, load) {
  const cache = caches.default;
  const request = new Request(CACHE + key);
  const hit = await cache.match(request);
  if (hit) return hit.json();
  const value = await load();
  await cache.put(request, new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json", "cache-control": `max-age=${ttl}` },
  }));
  return value;
}

// App access token (client credentials), kept until shortly before it expires.
async function twitchToken(env) {
  return cached("twitch-token", 24 * 60 * 60, async () => {
    const params = new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    });
    const res = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: "POST" });
    if (!res.ok) throw new Error(`Twitch token: HTTP ${res.status}`);
    return (await res.json()).access_token;
  });
}

async function twitchStatus(login, env) {
  if (!login || !env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return null;
  return cached(`twitch-${login.toLowerCase()}`, TWITCH_TTL_S, async () => {
    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`, {
      headers: { "client-id": env.TWITCH_CLIENT_ID, authorization: `Bearer ${await twitchToken(env)}` },
    });
    if (res.status === 401) {
      // Token revoked or expired early: forget it, the next request fetches a new one.
      await caches.default.delete(new Request(CACHE + "twitch-token"));
    }
    if (!res.ok) throw new Error(`Twitch streams: HTTP ${res.status}`);
    const stream = (await res.json()).data?.[0];
    return stream
      ? { live: true, title: stream.title, game: stream.game_name, viewers: stream.viewer_count, url: `https://www.twitch.tv/${login}` }
      : { live: false };
  });
}

// Album art may only come from these image servers (Last.fm and Apple's iTunes CDN).
const COVER_HOSTS = [
  /^lastfm\.freetls\.fastly\.net$/, // Last.fm
  /^is\d+-ssl\.mzstatic\.com$/, // iTunes
  /^cdn-images\.dzcdn\.net$/, /^e-cdns-images\.dzcdn\.net$/, // Deezer
  /^i\.ytimg\.com$/, // YouTube thumbnails
];
const isCoverUrl = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && COVER_HOSTS.some((host) => host.test(u.hostname));
  } catch {
    return false;
  }
};
// Last.fm's grey star placeholder, used when it has no real artwork.
const LASTFM_PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";
const COVER_TTL_S = 7 * 24 * 60 * 60;
const COVER_TIMEOUT_MS = 1000;

function lastfmImage(images) {
  const url = ["extralarge", "large", "medium"]
    .map((size) => images?.find((i) => i.size === size)?.["#text"])
    .find(Boolean);
  return url && !url.includes(LASTFM_PLACEHOLDER) && isCoverUrl(url) ? url : null;
}

// Artwork for a song Last.fm sent without one: Last.fm's track info first, then iTunes and Deezer,
// and only if none of them knows the song, YouTube. Cached per song for a week, including
// "nothing found". Returns { url, wide } – wide for 16:9 YouTube thumbnails.
async function findCover(artist, name, env) {
  const key = `cover3-${encodeURIComponent(`${artist}|${name}`.toLowerCase()).slice(0, 400)}`;
  return cached(key, COVER_TTL_S, async () => {
    try {
      const params = new URLSearchParams({
        method: "track.getInfo", artist, track: name, api_key: env.LASTFM_API_KEY, format: "json", autocorrect: "1",
      });
      const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, { headers: { "user-agent": "mikubeam.de link page" } });
      const fromLastfm = res.ok ? lastfmImage((await res.json()).track?.album?.image) : null;
      if (fromLastfm) return { url: fromLastfm };
    } catch {}
    // iTunes and Deezer are asked at the same time; iTunes wins if both know the song.
    // null = "service answered, no cover", undefined = "request failed".
    const [itunes, deezer] = await Promise.all([itunesCover(artist, name), deezerCover(artist, name)]);
    if (itunes || deezer) return { url: itunes || deezer, wide: false };
    // Last resort, because its daily quota is small (about 100 searches).
    const youtube = await youtubeCover(artist, name, env);
    if (youtube) return { url: youtube, wide: true };
    // Only remember "no cover" when every service really answered; after an error, try again next time.
    if (itunes === undefined || deezer === undefined || youtube === undefined) throw new Error("cover search failed");
    return { url: null, wide: false };
  });
}

// YouTube Data API search in the Music category. "Artist - Topic" channels (auto-generated by
// YouTube) use the official album art as thumbnail, so their videos are preferred.
async function youtubeCover(artist, name, env) {
  if (!env.YOUTUBE_API_KEY) return null;
  try {
    const params = new URLSearchParams({
      part: "snippet", type: "video", videoCategoryId: "10", maxResults: "5",
      q: `${artist} ${name}`, key: env.YOUTUBE_API_KEY,
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = (await res.json()).items ?? [];
    const pick = items.find((i) => / - Topic$/.test(i.snippet?.channelTitle ?? "")) ?? items[0];
    // "medium" is the full 16:9 thumbnail (320×180), shown uncropped.
    const url = pick?.snippet?.thumbnails?.medium?.url;
    return url && isCoverUrl(url) ? url : null;
  } catch (err) {
    console.warn(`YouTube cover: ${err.message}`);
    return undefined;
  }
}

async function itunesCover(artist, name) {
  try {
    const params = new URLSearchParams({ term: `${artist} ${name}`, entity: "song", limit: "1", country: "JP" });
    const res = await fetch(`https://itunes.apple.com/search?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const art = (await res.json()).results?.[0]?.artworkUrl100;
    // artworkUrl100 is 100×100; the same URL with a different size gives a sharper image.
    return art && isCoverUrl(art) ? art.replace(/\/100x100bb\./, "/300x300bb.") : null;
  } catch (err) {
    console.warn(`iTunes cover: ${err.message}`);
    return undefined;
  }
}

async function deezerCover(artist, name) {
  try {
    const res = await fetch(`https://api.deezer.com/search?limit=1&q=${encodeURIComponent(`${artist} ${name}`)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const art = (await res.json()).data?.[0]?.album?.cover_medium; // 250×250
    return art && isCoverUrl(art) ? art : null;
  } catch (err) {
    console.warn(`Deezer cover: ${err.message}`);
    return undefined;
  }
}

const coverPath = (url) => (url ? `/cover?src=${encodeURIComponent(url)}` : null);

async function lastfmTrack(user, env, ctx) {
  if (!user || !env.LASTFM_API_KEY) return null;
  return cached(`lastfm-${user.toLowerCase()}`, LASTFM_TTL_S, async () => {
    const params = new URLSearchParams({
      method: "user.getrecenttracks", user, api_key: env.LASTFM_API_KEY, format: "json", limit: "1",
    });
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, {
      headers: { "user-agent": "mikubeam.de link page" },
    });
    if (!res.ok) throw new Error(`Last.fm: HTTP ${res.status}`);
    const track = (await res.json()).recenttracks?.track?.[0];
    if (!track) return { playing: false };
    const artist = track.artist?.["#text"] ?? "";
    // A slow artwork search must not hold up the song itself. It still finishes in the background
    // (waitUntil) and lands in the cache, so the next refresh shows the cover.
    let cover = { url: lastfmImage(track.image), wide: false };
    if (!cover.url) {
      const search = findCover(artist, track.name, env).catch(() => null);
      ctx?.waitUntil(search);
      cover = (await Promise.race([search, timeout(COVER_TIMEOUT_MS)])) ?? { url: null, wide: false };
    }
    return {
      playing: track["@attr"]?.nowplaying === "true",
      playedAt: track.date?.uts ? Number(track.date.uts) * 1000 : null,
      name: track.name,
      artist,
      url: track.url,
      cover: coverPath(cover.url),
      coverWide: Boolean(cover.url && cover.wide),
    };
  });
}

const timeout = (ms) => new Promise((resolve) => setTimeout(() => resolve(null), ms));
const safe = (promise, label) =>
  Promise.race([promise, timeout(TIMEOUT_MS)]).catch((err) => {
    console.warn(`${label}: ${err.message}`);
    return null;
  });

// { twitch: {...} | null, music: {...} | null }
export async function getNow(config, env, ctx) {
  const now = config.now ?? {};
  const [twitch, music] = await Promise.all([
    safe(twitchStatus(now.twitch, env), "Twitch"),
    safe(lastfmTrack(now.lastfm, env, ctx), "Last.fm"),
  ]);
  return { twitch, music };
}

// /cover?src=<url>: album art served through the worker so visitors' browsers don't contact
// Last.fm or Apple themselves. Only the allowed image servers and image responses pass.
export async function serveCover(src) {
  if (!src || !isCoverUrl(src)) return new Response("Not Found", { status: 404 });
  const res = await fetch(src, { cf: { cacheTtl: COVER_TTL_S, cacheEverything: true } });
  if (!res.ok || !/^image\//.test(res.headers.get("content-type") || "")) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=604800",
      "x-content-type-options": "nosniff",
    },
  });
}
