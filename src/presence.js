// "Playing" rows in the "right now" box: the games from the owner's Discord status. The desktop
// program discord-presence reads them through a Discord bot and sends them here
// (POST /api/presence, secret PRESENCE_TOKEN). They are kept in D1 so every Cloudflare location
// sees the same state. The program repeats them every minute; anything older counts as
// "not playing" (PC off, program closed or Discord gone).

const STALE_MS = 3 * 60 * 1000;
const MAX_BODY = 8 * 1024;
const MAX_GAMES = 3;
const STATUSES = new Set(["online", "idle", "dnd", "offline"]);
// Game icons may only come from Discord's image servers (served to visitors through /cover).
const ICON_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

const SETUP = "CREATE TABLE IF NOT EXISTS presence (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated INTEGER NOT NULL)";
const WRITE = "INSERT INTO presence (id, data, updated) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated = excluded.updated";
const READ = "SELECT data, updated FROM presence WHERE id = 1";

async function run(db, sql, ...args) {
  try {
    return await db.prepare(sql).bind(...args).first();
  } catch (err) {
    // First use of a fresh database: create the table, then try once more.
    if (!/no such table/i.test(err.message)) throw err;
    await db.exec(SETUP);
    return db.prepare(sql).bind(...args).first();
  }
}

// Constant-time comparison of the bearer token (hashing first hides the length as well).
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  return crypto.subtle.timingSafeEqual(x, y);
}

const text = (value, max = 128) => {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

function iconUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === "https:" && ICON_HOSTS.has(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

// Keeps only the fields the page shows, in the expected types and lengths.
function clean(body) {
  const status = STATUSES.has(body?.status) ? body.status : "offline";
  const games = (Array.isArray(body?.games) ? body.games : [])
    .map((g) => {
      const start = Number(g?.start);
      return {
        name: text(g?.name),
        details: text(g?.details),
        state: text(g?.state),
        // Start times in the future or before 2015 (Discord's launch) are nonsense.
        start: Number.isFinite(start) && start > 1.42e12 && start <= Date.now() + 60_000 ? start : null,
        icon: iconUrl(g?.icon),
      };
    })
    .filter((g) => g.name)
    .slice(0, MAX_GAMES);
  return { status, games: status === "offline" ? [] : games };
}

// Whether the request carries the desktop program's token (Authorization: Bearer <PRESENCE_TOKEN>).
export async function fromDesktopProgram(request, env) {
  if (!env.PRESENCE_TOKEN) return false;
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return Boolean(token) && sameSecret(token, env.PRESENCE_TOKEN);
}

// POST /api/presence from the desktop program.
export async function savePresence(request, env) {
  if (!env.PRESENCE_TOKEN || !env.DB) return new Response("Not Found", { status: 404 });
  if (!(await fromDesktopProgram(request, env))) return new Response("Unauthorized", { status: 401 });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response("Payload Too Large", { status: 413 });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  await run(env.DB, WRITE, JSON.stringify(clean(body)), Date.now());
  return new Response(null, { status: 204 });
}

// The games currently played, or [] when there is no recent update.
export async function getGames(env) {
  if (!env.PRESENCE_TOKEN || !env.DB) return null;
  const row = await run(env.DB, READ);
  if (!row || Date.now() - row.updated > STALE_MS) return [];
  return JSON.parse(row.data).games ?? [];
}
