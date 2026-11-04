// Retro visitor counter stored in D1 (binding "DB"). Only the number is stored, nothing about visitors.

// Link previews (Discord, X, ...), crawlers and scripts don't count as visitors.
const NOT_A_VISITOR = /bot|crawl|spider|slurp|preview|embed|discord|whatsapp|telegram|slack|facebookexternalhit|headless|lighthouse|curl|wget|python|httpie|go-http|node-fetch|axios|java\//i;

const TIMEOUT_MS = 1500; // Render the page without the counter rather than wait longer.

const SETUP = "CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, hits INTEGER NOT NULL DEFAULT 0)";
const INCREMENT = "INSERT INTO counters (name, hits) VALUES (?1, 1) ON CONFLICT(name) DO UPDATE SET hits = hits + 1 RETURNING hits";
const READ = "SELECT hits FROM counters WHERE name = ?1";

async function query(db, sql, name) {
  try {
    return await db.prepare(sql).bind(name).first("hits");
  } catch (err) {
    // First use of a fresh database: create the table, then try once more.
    if (!/no such table/i.test(err.message)) throw err;
    await db.exec(SETUP);
    return db.prepare(sql).bind(name).first("hits");
  }
}

const timeout = (ms) => new Promise((resolve) => setTimeout(() => resolve(null), ms));

// Counts this request (unless it is a bot or a HEAD request) and returns the total, or null.
export async function countVisit(request, env, ctx, name = "home") {
  if (!env.DB) return null;
  const ua = request.headers.get("user-agent") || "";
  const counts = request.method === "GET" && ua && !NOT_A_VISITOR.test(ua);
  try {
    const pending = query(env.DB, counts ? INCREMENT : READ, name);
    // A slow write still finishes after the page is sent, so the visit isn't lost.
    ctx.waitUntil(pending.catch(() => {}));
    const hits = await Promise.race([pending, timeout(TIMEOUT_MS)]);
    return typeof hits === "number" ? hits : null;
  } catch (err) {
    console.warn(`Visitor counter: ${err.message}`);
    return null;
  }
}
