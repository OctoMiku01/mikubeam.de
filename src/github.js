// Live project stats from the GitHub API: latest version per Minecraft version, stars and downloads.
// Results are kept in the Cloudflare cache, so GitHub is asked at most once per hour per repo.

const FRESH_MS = 60 * 60 * 1000; // Refresh in the background once data is older than this.
const KEEP_S = 7 * 24 * 60 * 60; // Keep old data this long as a fallback when GitHub is unreachable.
const FIRST_LOAD_TIMEOUT_MS = 2500; // Without cached data, wait at most this long before rendering without stats.
// Bump the version whenever the shape of the stored stats changes, so old entries are ignored.
const CACHE_PREFIX = "https://cache.mikubeam.internal/github/v2/";

// "https://github.com/Owner/Repo" (optionally with a trailing slash or .git) -> "Owner/Repo".
export function repoFromUrl(url) {
  const match = String(url ?? "").match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

// Which repo a link shows stats for: "repo" in the config, otherwise taken from a GitHub URL.
// "stats": false switches it off.
export function linkRepo(link) {
  if (link.type === "header" || link.stats === false) return null;
  return link.repo || repoFromUrl(link.url);
}

const MC_VERSION = /^\d+\.\d+(?:\.\d+)?$/;

// Splits a release into its own version and the Minecraft version it is for, e.g.
// "v0.5.7-26.3" -> 0.5.7 / 26.3, or "v26.3.0-port.1" + name "... Minecraft 26.3" -> 26.3.0-port.1 / 26.3.
function parseRelease(release) {
  const tag = String(release.tag_name ?? "").replace(/^v/i, "");
  const dash = tag.lastIndexOf("-");
  if (dash > 0 && MC_VERSION.test(tag.slice(dash + 1))) {
    return { version: tag.slice(0, dash), mc: tag.slice(dash + 1) };
  }
  const fromName = String(release.name ?? "").match(/(?:Minecraft|MC|for)\s+(\d+\.\d+(?:\.\d+)?)/i);
  const fromAsset = (release.assets ?? []).map((a) => a.name.match(/mc(\d+\.\d+(?:\.\d+)?)/i)).find(Boolean);
  return { version: tag, mc: fromName?.[1] ?? fromAsset?.[1] ?? null };
}

const compareVersions = (a, b) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
};

// The jar players actually install: not the sources/javadoc/dev builds.
const isExtraJar = (name) => /-(sources|javadoc|dev|api)\.jar$/i.test(name);
function mainJar(release) {
  const jar = (release.assets ?? []).find((a) => /\.jar$/i.test(a.name) && !isExtraJar(a.name));
  return jar ? { name: jar.name, url: jar.browser_download_url, size: jar.size } : null;
}

// Boils the API answers down to the few values the pages need.
function summarize(repo, releases) {
  const latestPerMc = new Map();
  let downloads = 0;
  let updatedAt = null;
  // Releases come newest first, so the first one seen per Minecraft version is its latest.
  for (const release of releases) {
    if (release.draft) continue;
    for (const asset of release.assets ?? []) {
      if (!isExtraJar(asset.name)) downloads += asset.download_count ?? 0;
    }
    if (release.prerelease) continue;
    updatedAt ??= release.published_at;
    const { version, mc } = parseRelease(release);
    const key = mc ?? "";
    if (!latestPerMc.has(key)) {
      latestPerMc.set(key, { version, url: release.html_url, date: release.published_at, jar: mainJar(release) });
    }
  }
  const versions = [...latestPerMc]
    .map(([mc, info]) => ({ mc: mc || null, ...info }))
    .sort((a, b) => (a.mc && b.mc ? compareVersions(b.mc, a.mc) : 0));
  return {
    stars: repo.stargazers_count ?? 0,
    downloads,
    versions,
    updatedAt,
    description: repo.description || null,
    license: repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : null,
    url: repo.html_url,
  };
}

async function fetchStats(repo, env) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "mikubeam.de link page",
    "x-github-api-version": "2022-11-28",
  };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const api = `https://api.github.com/repos/${repo}`;
  const [repoRes, releasesRes] = await Promise.all([
    fetch(api, { headers }),
    fetch(`${api}/releases?per_page=100`, { headers }),
  ]);
  if (!repoRes.ok || !releasesRes.ok) {
    throw new Error(`GitHub API for ${repo}: HTTP ${repoRes.status}/${releasesRes.status}`);
  }
  return summarize(await repoRes.json(), await releasesRes.json());
}

async function refresh(repo, env, cache, key) {
  const stats = await fetchStats(repo, env);
  const body = JSON.stringify({ fetchedAt: Date.now(), stats });
  await cache.put(key, new Response(body, {
    headers: { "content-type": "application/json", "cache-control": `max-age=${KEEP_S}` },
  }));
  return stats;
}

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));

// Returns the stats for one repo, or null if there are none (yet).
// Old data is served right away and refreshed in the background (stale-while-revalidate).
export async function getRepoStats(repo, env, ctx) {
  const cache = caches.default;
  const key = new Request(CACHE_PREFIX + repo.toLowerCase());
  try {
    const cached = await cache.match(key);
    if (cached) {
      const { fetchedAt, stats } = await cached.json();
      if (Date.now() - fetchedAt > FRESH_MS) {
        ctx.waitUntil(refresh(repo, env, cache, key).catch((err) => console.warn(err.message)));
      }
      return stats;
    }
    const pending = refresh(repo, env, cache, key);
    // Let a slow first request finish (and fill the cache) even if the page is rendered without it.
    ctx.waitUntil(pending.catch(() => {}));
    return await Promise.race([pending, timeout(FIRST_LOAD_TIMEOUT_MS)]);
  } catch (err) {
    console.warn(`No stats for ${repo}: ${err.message}`);
    return null;
  }
}

// Fetches the stats for all links at once: { "Owner/Repo": stats | null }.
export async function getAllStats(links, env, ctx) {
  const repos = [...new Set(links.map(linkRepo).filter(Boolean))];
  const results = await Promise.all(repos.map((repo) => getRepoStats(repo, env, ctx)));
  return Object.fromEntries(repos.map((repo, i) => [repo, results[i]]));
}
