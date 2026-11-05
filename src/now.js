// "Right now" box: live status from Twitch and the current song from Last.fm.
// Both are cached briefly in the Cloudflare cache; a source without credentials is simply skipped.

const CACHE = "https://cache.mikubeam.internal/now/";
const TWITCH_TTL_S = 60;
const LASTFM_TTL_S = 30;
const TIMEOUT_MS = 1500;

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

// Only album art from Last.fm's image server may be passed through /cover/.
const COVER_HOST = "https://lastfm.freetls.fastly.net/i/u/";

async function lastfmTrack(user, env) {
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
    const image = track.image?.find((i) => i.size === "large")?.["#text"] || "";
    return {
      playing: track["@attr"]?.nowplaying === "true",
      playedAt: track.date?.uts ? Number(track.date.uts) * 1000 : null,
      name: track.name,
      artist: track.artist?.["#text"] ?? "",
      url: track.url,
      cover: image.startsWith(COVER_HOST) ? `/cover/${image.slice(COVER_HOST.length)}` : null,
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
export async function getNow(config, env) {
  const now = config.now ?? {};
  const [twitch, music] = await Promise.all([
    safe(twitchStatus(now.twitch, env), "Twitch"),
    safe(lastfmTrack(now.lastfm, env), "Last.fm"),
  ]);
  return { twitch, music };
}

// Temporary troubleshooting for /now?debug: asks both services directly (no cache, no time limit)
// and reports what came back. Never includes the keys themselves.
export async function diagnose(config, env) {
  const now = config.now ?? {};
  const report = { lastfm: { user: now.lastfm || null, keySet: Boolean(env.LASTFM_API_KEY) }, twitch: {
    login: now.twitch || null, clientIdSet: Boolean(env.TWITCH_CLIENT_ID), secretSet: Boolean(env.TWITCH_CLIENT_SECRET),
  } };
  if (now.lastfm && env.LASTFM_API_KEY) {
    const started = Date.now();
    try {
      const params = new URLSearchParams({
        method: "user.getrecenttracks", user: now.lastfm, api_key: env.LASTFM_API_KEY, format: "json", limit: "1",
      });
      const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, { headers: { "user-agent": "mikubeam.de link page" } });
      const text = await res.text();
      report.lastfm.http = res.status;
      report.lastfm.ms = Date.now() - started;
      try {
        const body = JSON.parse(text);
        if (body.error) report.lastfm.apiError = { code: body.error, message: body.message };
        const track = body.recenttracks?.track?.[0];
        report.lastfm.totalScrobbles = body.recenttracks?.["@attr"]?.total ?? null;
        if (track) {
          report.lastfm.latest = {
            name: track.name, artist: track.artist?.["#text"], nowPlaying: track["@attr"]?.nowplaying === "true",
            playedAt: track.date?.uts ? new Date(Number(track.date.uts) * 1000).toISOString() : null,
          };
        }
      } catch {
        report.lastfm.body = text.slice(0, 200);
      }
    } catch (err) {
      report.lastfm.fetchError = err.message;
    }
  }
  if (now.twitch && env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET) {
    try {
      const params = new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: "client_credentials",
      });
      const tokenRes = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: "POST" });
      report.twitch.tokenHttp = tokenRes.status;
      if (tokenRes.ok) {
        const { access_token: token } = await tokenRes.json();
        const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(now.twitch)}`, {
          headers: { "client-id": env.TWITCH_CLIENT_ID, authorization: `Bearer ${token}` },
        });
        report.twitch.streamsHttp = res.status;
        if (res.ok) report.twitch.live = Boolean((await res.json()).data?.length);
      } else {
        report.twitch.tokenError = (await tokenRes.text()).slice(0, 200);
      }
    } catch (err) {
      report.twitch.fetchError = err.message;
    }
  }
  return report;
}

// /cover/<size>/<file>: album art from Last.fm, served through the worker so visitors' browsers
// don't contact Last.fm themselves.
export async function serveCover(path) {
  if (!/^[\w-]+\/[\w-]+\.(?:jpg|png|webp|gif)$/i.test(path)) return new Response("Not Found", { status: 404 });
  const res = await fetch(COVER_HOST + path, { cf: { cacheTtl: 7 * 24 * 60 * 60, cacheEverything: true } });
  if (!res.ok) return new Response("Not Found", { status: 404 });
  return new Response(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=604800",
      "x-content-type-options": "nosniff",
    },
  });
}
