import config from "../config.json";
import { getAllStats, linkRepo } from "./github.js";
import { countVisit } from "./counter.js";
import { diagnose, getNow, serveCover } from "./now.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname, origin } = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const page = pathname === "/" || pathname === "/index.html"
      ? homePage
      : pathname === "/mods" || pathname === "/mods/"
        ? modsPage
        : null;
    if (page) {
      // Only the start page counts visitors and shows the "right now" box; all lookups run at once.
      const isHome = page === homePage;
      const [stats, visitors, now] = await Promise.all([
        getAllStats(config.links ?? [], env, ctx),
        isHome && config.counter ? countVisit(request, env, ctx) : null,
        isHome && config.now ? getNow(config, env) : null,
      ]);
      return new Response(renderPage(config, origin, page(config, stats, { visitors, now })), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=300",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
        },
      });
    }
    // "Right now" box as an HTML fragment; the start page reloads it every 30 seconds.
    if (pathname === "/now" && config.now && new URL(request.url).searchParams.has("debug")) {
      return new Response(JSON.stringify(await diagnose(config, env), null, 2), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
    if (pathname === "/now" && config.now) {
      return new Response(renderNow(await getNow(config, env)), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (pathname.startsWith("/cover/")) {
      return serveCover(pathname.slice("/cover/".length));
    }
    // Browsers and crawlers request /favicon.ico on their own; point them at the PNG.
    if (pathname === "/favicon.ico") {
      return Response.redirect(`${origin}/favicon.png`, 301);
    }
    // Static files from public/ never reach the worker, so anything else is a 404.
    return new Response("Not Found", { status: 404 });
  },
};

// Built-in icons (Feather style). Anything else is looked up on simpleicons.org by slug.
const BUILTIN_ICONS = {
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  package: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  "arrow-left": '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only allow harmless URL schemes (no javascript: etc.).
function safeUrl(url) {
  const value = String(url ?? "").trim();
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(value)) return value;
  return "#";
}

// CSS values come from the config; strip characters that could break out of the declaration.
function css(value) {
  return String(value ?? "").replace(/[;{}<>]/g, "");
}

// Icon used as a mask so it takes the current text color (and the accent color on hover).
function maskIcon(url) {
  const clean = String(url).replace(/['"()\\\s]/g, "");
  return `<span class="icon brand" style="--icon:url('${esc(clean)}')" aria-hidden="true"></span>`;
}

// tint: true colors any image icon, false keeps original colors; by default only SVGs are colored.
function renderIcon(icon, tint) {
  if (!icon) return "";
  if (BUILTIN_ICONS[icon]) {
    return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${BUILTIN_ICONS[icon]}</svg>`;
  }
  if (/^(https?:|\/)/.test(icon)) {
    const url = safeUrl(icon);
    if (tint ?? /\.svg($|\?|#)/i.test(url)) return maskIcon(url);
    return `<img class="icon" src="${esc(url)}" alt="" aria-hidden="true">`;
  }
  // Brand icon from Simple Icons.
  const slug = icon.toLowerCase().replace(/[^a-z0-9]/g, "");
  return maskIcon(`https://cdn.simpleicons.org/${slug}`);
}

function isExternal(url) {
  return /^https?:/i.test(url);
}

// Returns attributes that make an element take part in the staggered entrance animation.
function animator() {
  let index = 0;
  return (kind = "rise") => ` data-anim="${kind}" style="--i:${index++}"`;
}

// 950 -> "950", 1234 -> "1.2k", 1500000 -> "1.5M"
function compactNumber(n) {
  if (n < 1000) return String(n);
  const [value, unit] = n < 1e6 ? [n / 1e3, "k"] : [n / 1e6, "M"];
  return `${value < 10 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value)}${unit}`;
}

// Small line under a project: latest version(s), stars and downloads from GitHub.
function renderStats(stats) {
  if (!stats) return "";
  const parts = [];
  const { versions } = stats;
  if (versions.length) {
    const mcs = versions.map((v) => v.mc).filter(Boolean);
    if (new Set(versions.map((v) => v.version)).size === 1) {
      // Same version for every Minecraft version: "v1.1.0 · MC 26.3 / 26.2"
      parts.push(`<span class="chip">v${esc(versions[0].version)}${mcs.length ? ` · MC ${esc(mcs.join(" / "))}` : ""}</span>`);
    } else {
      // Different versions: one chip each, "v0.5.7 · MC 26.3" "v0.4.17 · MC 26.2"
      for (const v of versions) {
        parts.push(`<span class="chip">v${esc(v.version)}${v.mc ? ` · MC ${esc(v.mc)}` : ""}</span>`);
      }
    }
  }
  if (stats.stars > 0) {
    parts.push(`<span class="stat" title="GitHub stars">★ ${compactNumber(stats.stars)}</span>`);
  }
  if (stats.downloads > 0) {
    parts.push(`<span class="stat" title="Downloads on GitHub">↓ ${compactNumber(stats.downloads)}</span>`);
  }
  return parts.length ? `<span class="link-meta">${parts.join("")}</span>` : "";
}

function renderLink(link, anim, stats = {}) {
  if (link.type === "header") {
    return `<h2 class="section"${anim()}>${esc(link.label)}</h2>`;
  }
  const repo = linkRepo(link);
  const url = safeUrl(link.url);
  const target = isExternal(url) ? ' target="_blank" rel="noopener noreferrer"' : "";
  const classes = ["link", link.highlight ? "highlight" : ""].filter(Boolean).join(" ");
  return `<a class="${classes}" href="${esc(url)}"${target}${anim()}>
        ${renderIcon(link.icon, link.tint)}
        <span class="link-text">
          <span class="link-label">${esc(link.label)}</span>
          ${link.description ? `<span class="link-desc">${esc(link.description)}</span>` : ""}
          ${repo ? renderStats(stats[repo]) : ""}
        </span>
      </a>`;
}

function renderSocial(social, anim) {
  const url = safeUrl(social.url);
  const target = isExternal(url) ? ' target="_blank" rel="noopener noreferrer"' : "";
  const label = esc(social.label || social.icon);
  return `<a class="social" href="${esc(url)}"${target} aria-label="${label}" title="${label}"${anim("pop")}>${renderIcon(social.icon, social.tint)}</a>`;
}

// Embeds (Discord, Twitter, ...) need absolute URLs, so resolve paths like "/banner.jpg".
function absoluteUrl(url, origin) {
  const value = safeUrl(url);
  return value.startsWith("/") ? origin + value : value;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Readable text color on top of an accent color (WCAG relative luminance).
function inkFor(hex) {
  const channel = (i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.5 ? "#1b1b1b" : "#ffffff";
}

// Pixel art leek for the easter egg (diagonal, black outline): one character per pixel, "." is transparent.
const LEEK_PIXELS = [
  "................K....KK....",
  "...............KDK..KGDK...",
  "..............KGDK.KHGK....",
  "..............KGDKKHGK.....",
  "..............KDDKKGDK...K.",
  "..............KDKKHGK..KKHK",
  ".............KGDKHGDKKKHGDK",
  ".............KGDHGGKKHHGDK.",
  ".............KGHHGDHHGGKK..",
  "............KGDHGHHGGDKKKK.",
  "............KGHGHHGGDKGGGDK",
  "............KHHHGGDDDDDDKK.",
  "...........KLLGGGDDDDDKK...",
  "..........KYYLLGDDDKKK.....",
  ".........KVYYYGGKKK........",
  "........KVWWYYLK...........",
  ".......KVWWWWLK............",
  "......KVWWWWSK.............",
  ".....KVWWWWSK..............",
  "....KVWWWWSK...............",
  "...KVWWWWSK................",
  "..KVWWWWSK.................",
  ".KVWWWWSK..................",
  "KEEWWWSK...................",
  "KEEEWSK....................",
  "KEEEEK.....................",
  ".KEEK......................",
  "..KK.......................",
];
// Miku-style negi (long green onion): tube that splits into three cut-off ends, the main one hollow.
const NEGI_PIXELS = [
  ".....KKKKK............",
  "....KPPOOPK...........",
  "....KPOOODDK..........",
  "....KHHGGDDK..........",
  ".....KHGGGDK..........",
  ".....KHGGGDK..........",
  ".....KHHGGDK..........",
  ".....KHHGGDDK.........",
  "......KHGGDDK.........",
  "..KK..KHGGDDKK........",
  ".KPDKKKHGGGDPPK.......",
  "KPPGDDKHHGGDHPPK......",
  "KPHGGDDHHGGDGGK.......",
  ".KKHGGGDHGGDDDK.......",
  "...KHHGGHGGDDDK.......",
  "....KHHGHHLLDDK.......",
  ".....KHHHHLLDK........",
  "......KKHHLLGGK.......",
  "........KLGGGGK.......",
  "........KLLGGGK.......",
  "........KLLGGGK.......",
  ".........KLGGGGK......",
  ".........KLLGGGK......",
  ".........KLLGLGK......",
  "..........KLLLGK......",
  "..........KLLLGGK.....",
  "..........KLLLLGK.....",
  "...........KLLLGK.....",
  "...........KLLLLLK....",
  "...........KYYYYLK....",
  "............KYYYLK....",
  "............KYYYLK....",
  "............KYYYSSK...",
  ".............KVWWSK...",
  ".............KVWWSK...",
  ".............KVVWSK...",
  "..............KVWSSK..",
  "..............KVWWSK..",
  "..............KVWWSK..",
  "..............KVVWSK..",
  "...............KVWWSK.",
  "...............KVWWSK.",
  "...............KVVWSK.",
  "................KVWEK.",
  "................KEEEEK",
  "................KEEEEK",
  ".................KEEK.",
  "..................KK..",
];
const LEEK_COLORS = {
  K: "#141414", // outline
  D: "#1d6a2b", // dark leaf green
  G: "#2f9a3c", // leaf green
  H: "#5cc552", // leaf highlight
  L: "#9fdc4a", // lime band
  Y: "#d8f1b2", // pale green
  W: "#eef4e6", // white stalk
  V: "#ffffff", // stalk highlight
  S: "#bccab0", // stalk shadow
  E: "#e8e3a2", // yellowish root end
  O: "#0a2410", // hollow inside of a cut tube
  P: "#b7e886", // light rim of a cut end
};

// Turns the pixel rows into an SVG, merging same-colored runs into one rect each.
function pixelArtSvg(rows, colors) {
  let rects = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const ch = row[x];
      let end = x + 1;
      while (row[end] === ch) end++;
      if (colors[ch]) rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${colors[ch]}"/>`;
      x = end;
    }
  });
  return `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
// [svg, width in px]: drawn at 2 screen pixels per pixel so the edges stay crisp.
const LEEK_SPRITES = [LEEK_PIXELS, NEGI_PIXELS].map((rows) => [pixelArtSvg(rows, LEEK_COLORS), rows[0].length * 2]);

// JSON that is safe to put inside a <script> tag.
const jsonForScript = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

// Discord & co. cache embed images per URL. The banner is generated from the config,
// so a hash of the config as ?v= makes them fetch the new image after every change.
function configVersion(c) {
  let hash = 0x811c9dc5;
  for (const ch of JSON.stringify(c)) {
    hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
const CONFIG_VERSION = configVersion(config);

// Start page: profile, socials and all links.
// "You are visitor no. 000042" with each digit in its own little glowing box.
function renderCounter(visitors, anim) {
  if (typeof visitors !== "number") return "";
  const digits = String(visitors).padStart(6, "0");
  return `<div class="counter"${anim()} title="${esc(visitors.toLocaleString("en-US"))} visits">
      <span class="counter-label">you are visitor no.</span>
      <span class="counter-digits" aria-label="${visitors}">${[...digits].map((d) => `<span>${d}</span>`).join("")}</span>
    </div>`;
}

// "3 min ago", "2 h ago"
function timeAgo(ms) {
  const minutes = Math.max(1, Math.round((Date.now() - ms) / 60000));
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
}

const LAST_PLAYED_MAX_MS = 2 * 60 * 60 * 1000; // Show the last song only if it was this recent.

// Inner HTML of the "right now" box; empty when there is nothing to show.
function renderNow(now) {
  if (!now) return "";
  const rows = [];
  const { twitch, music } = now;
  if (twitch?.live) {
    const details = [twitch.game, `${compactNumber(twitch.viewers ?? 0)} watching`].filter(Boolean).join(" · ");
    rows.push(`<a class="now-row now-live" href="${esc(safeUrl(twitch.url))}" target="_blank" rel="noopener noreferrer">
        <span class="live-badge"><span class="live-dot"></span>LIVE</span>
        <span class="now-text"><span class="now-title">${esc(twitch.title)}</span><span class="now-sub">${esc(details)}</span></span>
      </a>`);
  }
  const recent = music && (music.playing || (music.playedAt && Date.now() - music.playedAt < LAST_PLAYED_MAX_MS));
  if (recent && music.name) {
    const label = music.playing ? "Listening to" : `Last played · ${timeAgo(music.playedAt)}`;
    rows.push(`<a class="now-row now-music${music.playing ? " playing" : ""}" href="${esc(safeUrl(music.url))}" target="_blank" rel="noopener noreferrer">
        ${music.cover ? `<img class="cover" src="${esc(music.cover)}" alt="" width="44" height="44" loading="lazy">` : `<span class="cover cover-empty">♪</span>`}
        <span class="now-text"><span class="now-label">${esc(label)}</span><span class="now-title">${esc(music.name)}</span><span class="now-sub">${esc(music.artist)}</span></span>
        ${music.playing ? '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>' : ""}
      </a>`);
  }
  return rows.join("\n      ");
}

function homePage(c, stats, { visitors, now } = {}) {
  const bio = esc(c.bio).replace(/\n/g, "<br>");
  return {
    path: "/",
    loader: true,
    retroFont: Boolean(c.counter),
    content: (anim) => `
    ${c.avatar ? `<img class="avatar" src="${esc(safeUrl(c.avatar))}" alt="${esc(c.name)}" width="112" height="112"${anim("avatar")}>` : ""}
    <h1${anim()}>${esc(c.name)}</h1>
    ${c.handle ? `<p class="handle"${anim()}>${esc(c.handle)}</p>` : ""}
    ${c.bio ? `<p class="bio"${anim()}>${bio}</p>` : ""}
    ${c.socials?.length ? `<nav class="socials" aria-label="Social Media">
      ${c.socials.map((s) => renderSocial(s, anim)).join("\n      ")}
    </nav>` : ""}
    ${c.now ? `<div class="now" aria-live="polite"${anim()}>${renderNow(now)}</div>` : ""}
    <div class="links">
      ${(c.links ?? []).map((l) => renderLink(l, anim, stats)).join("\n      ")}
    </div>
    ${c.counter ? renderCounter(visitors, anim) : ""}
    ${c.footer ? `<footer${anim()}>${esc(c.footer)}</footer>` : ""}`,
  };
}

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const formatSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// One card on /mods: description, facts and a download button per Minecraft version.
function renderModCard(link, stats, anim) {
  const description = link.description || stats?.description || "";
  const repoUrl = safeUrl(stats?.url || link.url);
  const facts = [];
  if (stats?.downloads > 0) facts.push(`↓ ${compactNumber(stats.downloads)} downloads`);
  if (stats?.stars > 0) facts.push(`★ ${compactNumber(stats.stars)}`);
  if (stats?.updatedAt) facts.push(`Updated ${formatDate(stats.updatedAt)}`);
  if (stats?.license) facts.push(esc(stats.license));

  const rows = (stats?.versions ?? []).map((v) => {
    const label = `${v.mc ? `<span class="mc">MC ${esc(v.mc)}</span>` : ""}<span class="ver">v${esc(v.version)}</span>`;
    const button = v.jar
      ? `<a class="dl" href="${esc(safeUrl(v.jar.url))}" title="${esc(v.jar.name)}">${renderIcon("download")}<span>Download</span><small>${formatSize(v.jar.size)}</small></a>`
      : `<a class="dl secondary" href="${esc(safeUrl(v.url))}" target="_blank" rel="noopener noreferrer">Release page</a>`;
    return `<li class="release">${label}${button}</li>`;
  });

  return `<article class="mod"${anim()}>
        <header>
          <h3>${esc(link.label)}</h3>
          ${description ? `<p>${esc(description)}</p>` : ""}
          ${facts.length ? `<p class="facts">${facts.join("<span aria-hidden=\"true\"> · </span>")}</p>` : ""}
        </header>
        ${rows.length
          ? `<ul class="releases">${rows.join("")}</ul>`
          : `<p class="empty">No release info right now – see GitHub.</p>`}
        <footer>
          <a href="${esc(repoUrl)}" target="_blank" rel="noopener noreferrer">${renderIcon("github")}Source</a>
          <a href="${esc(repoUrl)}/releases" target="_blank" rel="noopener noreferrer">All versions</a>
        </footer>
      </article>`;
}

// /mods: every link that points to a GitHub repo, grouped by the headers from the config.
function modsPage(c, stats) {
  const groups = [];
  for (const link of c.links ?? []) {
    if (link.type === "header") {
      groups.push({ label: link.label, mods: [] });
    } else if (linkRepo(link)) {
      if (!groups.length) groups.push({ label: null, mods: [] });
      groups.at(-1).mods.push(link);
    }
  }
  const name = c.meta?.title || c.name;
  return {
    path: "/mods",
    title: `Mods · ${name}`,
    description: `All Minecraft mods by ${name} with downloads for every supported version.`,
    wide: true,
    content: (anim) => `
    <a class="back" href="/"${anim()}>${renderIcon("arrow-left")}${esc(name)}</a>
    <h1${anim()}>Mods</h1>
    <p class="bio"${anim()}>All my Minecraft mods and ports, with downloads for every supported version.</p>
    ${groups.filter((g) => g.mods.length).map((g) => `
    ${g.label ? `<h2 class="section"${anim()}>${esc(g.label)}</h2>` : ""}
    <div class="mods">
      ${g.mods.map((link) => renderModCard(link, stats[linkRepo(link)], anim)).join("\n      ")}
    </div>`).join("")}
    ${c.footer ? `<footer${anim()}>${esc(c.footer)}</footer>` : ""}`,
  };
}

// Shared page frame (head, theme, background, animations) around the content of one page.
function renderPage(c, origin, page) {
  const theme = c.theme ?? {};
  const bg = c.background ?? {};
  const meta = c.meta ?? {};
  const title = page.title || meta.title || c.name;
  const description = page.description || meta.description || c.bio || "";
  const themeColor = meta.themeColor || theme.accent || bg.color || "#000000";
  // A dedicated meta.image is shown as a large banner, otherwise the avatar as a small thumbnail.
  const ogImage = meta.image
    ? `${meta.image}${meta.image.includes("?") ? "&" : "?"}v=${CONFIG_VERSION}`
    : c.avatar;
  const font = theme.font && theme.font !== "system" ? theme.font : null;
  const animation = c.animation ?? {};
  const entrance = animation.entrance !== false;
  // The loader only greets visitors on the start page; subpages open straight away.
  const loader = entrance && animation.loader !== false && page.loader === true;
  // Without entrance animation every element simply renders visible.
  const anim = entrance ? animator() : () => "";
  // Without a loader the entrance starts right away, so the page is "ready" from the start.
  const bodyClasses = [
    `style-${theme.buttonStyle || "glass"}`,
    entrance ? "entrance" : "",
    entrance && !loader ? "ready" : "",
  ].filter(Boolean).join(" ");

  const bgLayer = bg.image
    ? `url('${css(safeUrl(bg.image))}') center / cover no-repeat`
    : bg.gradient
      ? css(bg.gradient)
      : "none";

  const accent = HEX_COLOR.test(theme.accent ?? "") ? theme.accent : "#39c5bb";
  // Color themes the visitor can switch between; the choice is remembered in their browser.
  const themes = (c.themes ?? []).filter((t) => t?.name && HEX_COLOR.test(t.accent ?? ""));
  const themeMap = Object.fromEntries(themes.map((t) => [t.name, [t.accent, inkFor(t.accent)]]));
  const fontFamilies = [
    font && `family=${encodeURIComponent(font)}:wght@400;500;600;700`,
    page.retroFont && "family=VT323",
  ].filter(Boolean);

  return `<!doctype html>
<html lang="${esc(meta.lang || "de")}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="${esc(css(themeColor))}">
  <meta property="og:type" content="profile">
  <meta property="og:url" content="${esc(origin + page.path)}">
  ${meta.siteName ? `<meta property="og:site_name" content="${esc(meta.siteName)}">` : ""}
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  ${ogImage ? `<meta property="og:image" content="${esc(absoluteUrl(ogImage, origin))}">` : ""}
  <meta name="twitter:card" content="${meta.image ? "summary_large_image" : "summary"}">
  ${meta.image ? `<meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:image" content="${esc(absoluteUrl(ogImage, origin))}">` : ""}
  <link rel="icon" type="image/png" sizes="192x192" href="/favicon.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  ${fontFamilies.length ? `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fontFamilies.join("&")}&display=swap">` : ""}
  ${themes.length ? `<script>
    // Apply the saved color theme before the page is drawn, so it doesn't flash in the default color.
    try {
      const saved = ${jsonForScript(themeMap)}[localStorage.getItem("theme")];
      if (saved) {
        document.documentElement.style.setProperty("--accent", saved[0]);
        document.documentElement.style.setProperty("--accent-ink", saved[1]);
      }
    } catch {}
  </script>` : ""}
  <style>
    :root {
      --text: ${css(theme.text || "#ffffff")};
      --accent: ${css(accent)};
      /* Text on accent-colored buttons: dark on light accents like yellow, white otherwise */
      --accent-ink: ${inkFor(accent)};
      --radius: ${css(theme.radius || "14px")};
      --bg-color: ${css(bg.color || "#111111")};
      /* Shown behind the image, e.g. while it is still loading */
      --bg-base: ${bg.gradient ? `${css(bg.gradient)}, ` : ""}var(--bg-color);
      --bg-layer: ${bgLayer};
      --bg-blur: ${Number(bg.blur) || 0}px;
      --bg-dim: ${Number(bg.dim) || 0};
      --font: ${font ? `"${css(font)}", ` : ""}system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      font-family: var(--font);
      color: var(--text);
      background: var(--bg-base);
      background-attachment: fixed;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      justify-content: center;
      padding: 48px 16px 32px;
      -webkit-font-smoothing: antialiased;
    }
    body::before, body::after {
      content: "";
      position: fixed;
      z-index: -1;
      pointer-events: none;
    }
    body::before {
      inset: calc(var(--bg-blur) * -2);
      background: var(--bg-layer);
      filter: blur(var(--bg-blur));
    }
    body::after {
      inset: 0;
      background: rgba(0, 0, 0, var(--bg-dim));
    }
    main {
      width: 100%;
      max-width: 580px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .avatar {
      width: 112px;
      height: 112px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid var(--accent);
      box-shadow: 0 8px 30px rgba(0, 0, 0, .35);
    }
    h1 { margin: 16px 0 2px; font-size: 1.6rem; font-weight: 700; }
    .handle { margin: 0; opacity: .7; font-size: .95rem; }
    .bio { margin: 14px 0 0; line-height: 1.5; max-width: 46ch; opacity: .92; }
    .socials {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 6px;
      margin-top: 18px;
    }
    .social {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      color: var(--text);
      transition: transform .15s ease, color .15s ease;
    }
    .social:hover, .social:focus-visible { color: var(--accent); transform: translateY(-2px); }
    .social .icon { width: 26px; height: 26px; }
    .links { width: 100%; display: flex; flex-direction: column; gap: 12px; margin-top: 28px; }
    .section {
      margin: 14px 0 0;
      font-size: .8rem;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      opacity: .7;
    }
    .link {
      position: relative;
      display: flex;
      align-items: center;
      gap: 14px;
      min-height: 60px;
      padding: 12px 52px;
      border-radius: var(--radius);
      color: var(--text);
      text-decoration: none;
      transition: transform .15s ease, background-color .15s ease, border-color .15s ease;
    }
    .link .icon {
      position: absolute;
      left: 16px;
      width: 24px;
      height: 24px;
      flex: none;
    }
    .link-text { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .link-label { font-weight: 500; }
    .link-desc { font-size: .85rem; opacity: .75; }
    .link-meta {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 4px 10px;
      margin-top: 5px;
      font-size: .75rem;
      font-variant-numeric: tabular-nums;
    }
    .link-meta .chip {
      padding: 2px 8px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 22%, transparent);
      border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
      font-weight: 500;
    }
    .link-meta .stat { opacity: .8; }

    /* Subpage /mods */
    main.wide { max-width: 720px; }
    .back {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 2px;
      color: var(--text);
      opacity: .8;
      text-decoration: none;
      font-size: .9rem;
    }
    .back:hover, .back:focus-visible { opacity: 1; color: var(--accent); }
    .back .icon { width: 18px; height: 18px; }
    main.wide h1 { margin-top: 8px; font-size: 2rem; }
    .mods { width: 100%; display: flex; flex-direction: column; gap: 14px; margin-top: 12px; }
    .mod {
      width: 100%;
      padding: 20px 22px;
      border-radius: var(--radius);
      text-align: left;
      background: rgba(255, 255, 255, .12);
      border: 1px solid rgba(255, 255, 255, .18);
      -webkit-backdrop-filter: blur(12px);
      backdrop-filter: blur(12px);
    }
    .style-solid .mod { background: rgba(0, 0, 0, .35); }
    .style-outline .mod { background: transparent; border: 2px solid var(--text); }
    .mod h3 { margin: 0; font-size: 1.2rem; font-weight: 700; }
    .mod header p { margin: 6px 0 0; line-height: 1.45; opacity: .85; font-size: .95rem; }
    .mod header .facts { font-size: .8rem; opacity: .7; font-variant-numeric: tabular-nums; }
    .releases { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .release {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 8px 8px 14px;
      border-radius: calc(var(--radius) - 4px);
      background: rgba(0, 0, 0, .18);
    }
    .release .mc { font-weight: 700; min-width: 4.5em; }
    .release .ver { flex: 1; opacity: .8; font-size: .9rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .dl {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 999px;
      background: var(--accent);
      color: var(--accent-ink);
      font-weight: 600;
      font-size: .9rem;
      text-decoration: none;
      white-space: nowrap;
      transition: filter .15s ease, transform .15s ease;
    }
    .dl:hover, .dl:focus-visible { filter: brightness(1.1); transform: translateY(-1px); }
    .dl .icon { width: 16px; height: 16px; }
    .dl small { font-weight: 500; opacity: .8; font-size: .75rem; }
    .dl.secondary { background: transparent; border: 1px solid var(--accent); }
    .mod .empty { margin: 14px 0 0; font-size: .9rem; opacity: .7; }
    .mod footer { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 14px; font-size: .85rem; opacity: 1; }
    .mod footer a { display: inline-flex; align-items: center; gap: 6px; color: var(--text); opacity: .75; text-decoration: none; }
    .mod footer a:hover, .mod footer a:focus-visible { opacity: 1; color: var(--accent); }
    .mod footer .icon { width: 16px; height: 16px; }
    @media (max-width: 480px) {
      .mod { padding: 16px; }
      .dl small { display: none; }
    }
    .link:hover, .link:focus-visible { transform: scale(1.02); }

    /* Button styles: glass | solid | outline */
    .style-glass .link {
      background: rgba(255, 255, 255, .12);
      border: 1px solid rgba(255, 255, 255, .18);
      -webkit-backdrop-filter: blur(12px);
      backdrop-filter: blur(12px);
    }
    .style-glass .link:hover { background: rgba(255, 255, 255, .2); }
    .style-solid .link { background: var(--accent); border: 1px solid transparent; }
    .style-solid .link:hover { filter: brightness(1.08); }
    .style-outline .link { background: transparent; border: 2px solid var(--text); }
    .style-outline .link:hover { background: var(--text); color: var(--bg-color); }
    .link.highlight { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    .style-solid .link.highlight { background: transparent; border: 2px solid var(--accent); }

    .icon.brand {
      display: inline-block;
      background-color: currentColor;
      -webkit-mask: var(--icon) center / contain no-repeat;
      mask: var(--icon) center / contain no-repeat;
    }
    img.icon { object-fit: contain; border-radius: 4px; }
    a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    footer { margin-top: 40px; font-size: .8rem; opacity: .6; }

    /* "Right now" box: Twitch live status and current song */
    .now { width: 100%; display: flex; flex-direction: column; gap: 8px; margin-top: 22px; }
    .now:empty { display: none; }
    .now-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: var(--radius);
      color: var(--text);
      text-decoration: none;
      text-align: left;
      background: rgba(0, 0, 0, .28);
      border: 1px solid rgba(255, 255, 255, .14);
      -webkit-backdrop-filter: blur(12px);
      backdrop-filter: blur(12px);
      transition: transform .15s ease, border-color .15s ease;
    }
    .now-row:hover, .now-row:focus-visible { transform: scale(1.02); border-color: var(--accent); }
    .now-live { border-color: rgba(255, 70, 85, .7); }
    .now-live:hover, .now-live:focus-visible { border-color: #ff4655; }
    .now-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .now-text > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .now-label { font-size: .7rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--accent); }
    .now-title { font-weight: 600; font-size: .95rem; }
    .now-sub { font-size: .8rem; opacity: .75; }
    .live-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 9px;
      border-radius: 6px;
      background: #e91e3c;
      color: #fff;
      font-size: .75rem;
      font-weight: 800;
      letter-spacing: .06em;
      flex: none;
    }
    .live-dot { width: 7px; height: 7px; border-radius: 50%; background: #fff; animation: live-pulse 1.4s ease-in-out infinite; }
    @keyframes live-pulse { 50% { opacity: .3; } }
    .cover { width: 44px; height: 44px; border-radius: 6px; object-fit: cover; flex: none; box-shadow: 0 2px 8px rgba(0, 0, 0, .4); }
    .cover-empty { display: grid; place-items: center; background: rgba(255, 255, 255, .12); font-size: 1.2rem; }
    .eq { display: flex; align-items: flex-end; gap: 2px; height: 16px; flex: none; }
    .eq i { width: 3px; height: 100%; border-radius: 1px; background: var(--accent); transform-origin: bottom; animation: eq 1s ease-in-out infinite; }
    .eq i:nth-child(2) { animation-delay: -.4s; }
    .eq i:nth-child(3) { animation-delay: -.7s; }
    @keyframes eq { 0%, 100% { transform: scaleY(.3); } 50% { transform: scaleY(1); } }
    @media (prefers-reduced-motion: reduce) {
      .live-dot, .eq i { animation: none; }
    }

    /* Retro visitor counter */
    .counter { margin-top: 40px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .counter + footer { margin-top: 18px; }
    .counter-label { font-family: "VT323", ui-monospace, monospace; font-size: 1.05rem; letter-spacing: .06em; opacity: .75; }
    .counter-digits { display: inline-flex; gap: 3px; padding: 4px; border-radius: 6px; background: rgba(0, 0, 0, .55); border: 1px solid rgba(255, 255, 255, .15); }
    .counter-digits span {
      width: 1.35rem;
      padding: 1px 0 0;
      border-radius: 3px;
      background: linear-gradient(#111 0 50%, #1c1c1c 50% 100%);
      color: var(--accent);
      font: 1.6rem/1.1 "VT323", ui-monospace, monospace;
      text-align: center;
      text-shadow: 0 0 6px var(--accent);
    }

    /* Color theme picker (top right) */
    .themes {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 5;
      display: flex;
      gap: 6px;
      padding: 6px;
      border-radius: 999px;
      background: rgba(0, 0, 0, .3);
      -webkit-backdrop-filter: blur(8px);
      backdrop-filter: blur(8px);
    }
    .swatch {
      width: 22px;
      height: 22px;
      padding: 0;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, .5);
      background: var(--c);
      cursor: pointer;
      transition: transform .15s ease, border-color .15s ease;
    }
    .swatch:hover { transform: scale(1.12); }
    .swatch[aria-pressed="true"] { border-color: #fff; box-shadow: 0 0 0 2px var(--c); }
    .swatch:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

    /* Easter egg: falling leeks */
    .leek {
      position: fixed;
      top: -90px;
      z-index: 20;
      pointer-events: none; /* width is set per sprite */
      animation: leek-fall var(--fall) cubic-bezier(.35, 0, .65, 1) forwards;
    }
    .leek svg { display: block; width: 100%; filter: drop-shadow(3px 3px 0 rgba(0, 0, 0, .3)); }
    @keyframes leek-fall {
      to { translate: var(--drift) calc(100vh + 120px); rotate: var(--spin); }
    }
    /* Loader: avatar with a spinning ring, shown until everything has loaded */
    .loader {
      position: fixed;
      inset: 0;
      z-index: 10;
      display: grid;
      place-items: center;
      background: var(--bg-color);
      transition: opacity .6s ease, visibility .6s;
    }
    .loader-ring {
      position: relative;
      width: 96px;
      height: 96px;
      transition: transform .6s cubic-bezier(.5, 0, .75, 0), opacity .5s ease;
    }
    .loader-ring::before {
      content: "";
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      background: conic-gradient(from 0deg, transparent 0%, var(--accent) 75%, transparent 76%);
      -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
      mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
      animation: spin .9s linear infinite;
    }
    .loader-ring::after {
      content: "";
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      box-shadow: 0 0 40px var(--accent);
      opacity: .35;
      animation: glow 1.8s ease-in-out infinite;
    }
    .loader-ring img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
      opacity: 0;
      transition: opacity .4s ease;
      animation: breathe 1.8s ease-in-out infinite;
    }
    /* Only show the avatar once it is complete, not while it is still drawing line by line */
    .loader-ring img.loaded { opacity: 1; }
    .ready .loader { opacity: 0; visibility: hidden; }
    .ready .loader-ring { transform: scale(1.6); opacity: 0; }

    /* Entrance: elements appear one after another once the page is ready */
    .entrance [data-anim] { opacity: 0; }
    /* The background image fades in separately, only once it is fully loaded */
    .entrance::before { opacity: 0; }
    .entrance.ready.bg-ready::before { animation: bg-in 1.4s ease-out forwards; }
    .entrance.ready [data-anim="rise"] {
      animation: rise .7s cubic-bezier(.2, .8, .2, 1) forwards;
      animation-delay: calc(var(--i) * 70ms + 150ms);
    }
    .entrance.ready [data-anim="pop"] {
      animation: pop .5s cubic-bezier(.3, 1.6, .5, 1) forwards;
      animation-delay: calc(var(--i) * 70ms + 150ms);
    }
    .entrance.ready [data-anim="avatar"] {
      animation: avatar-in .8s cubic-bezier(.3, 1.4, .5, 1) forwards;
      animation-delay: 100ms;
    }

    /* Animate the individual translate/scale properties so hover transforms keep working */
    @keyframes spin { to { transform: rotate(1turn); } }
    @keyframes glow { 50% { opacity: .7; } }
    @keyframes breathe { 50% { scale: .98; } }
    @keyframes bg-in { from { opacity: 0; scale: 1.12; } to { opacity: 1; scale: 1; } }
    @keyframes rise { from { opacity: 0; translate: 0 18px; } to { opacity: 1; translate: 0 0; } }
    @keyframes pop { from { opacity: 0; scale: .3; } to { opacity: 1; scale: 1; } }
    @keyframes avatar-in { from { opacity: 0; scale: .6; rotate: -12deg; } to { opacity: 1; scale: 1; rotate: 0deg; } }

    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; }
      .loader { display: none; }
      .entrance [data-anim], .entrance::before { animation: none !important; opacity: 1 !important; }
    }
  </style>
  ${entrance ? `<noscript><style>
    .loader { display: none; }
    .entrance [data-anim], .entrance::before { opacity: 1; }
  </style></noscript>` : ""}
</head>
<body class="${esc(bodyClasses)}">
  ${loader ? `<div class="loader" aria-hidden="true">
    <div class="loader-ring">${c.avatar ? `<img src="${esc(safeUrl(c.avatar))}" alt="" onload="this.classList.add('loaded')">` : ""}</div>
  </div>` : ""}
  ${themes.length > 1 ? `<div class="themes" role="group" aria-label="Color theme" hidden>
    ${themes.map((t) => `<button class="swatch" type="button" data-theme="${esc(t.name)}" style="--c:${css(t.accent)}" aria-label="${esc(t.name)}" title="${esc(t.name)}" aria-pressed="false"></button>`).join("\n    ")}
  </div>` : ""}
  <main${page.wide ? ' class="wide"' : ""}>${page.content(anim)}
  </main>
  ${themes.length > 1 ? `<script>
    (() => {
      // Color theme picker; the default theme is the first one, the choice is kept in localStorage.
      const themes = ${jsonForScript(themeMap)};
      const picker = document.querySelector(".themes");
      const root = document.documentElement;
      let current = null;
      try { current = localStorage.getItem("theme"); } catch {}
      if (!themes[current]) current = ${jsonForScript(themes[0].name)};
      const mark = () => picker.querySelectorAll(".swatch").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === current)));
      picker.addEventListener("click", (e) => {
        const button = e.target.closest(".swatch");
        if (!button || !themes[button.dataset.theme]) return;
        current = button.dataset.theme;
        root.style.setProperty("--accent", themes[current][0]);
        root.style.setProperty("--accent-ink", themes[current][1]);
        try { localStorage.setItem("theme", current); } catch {}
        mark();
      });
      mark();
      picker.hidden = false;
    })();
  </script>` : ""}
  ${c.now && page.path === "/" ? `<script>
    (() => {
      // Keep the "right now" box fresh without reloading; pause while the tab is in the background.
      const box = document.querySelector(".now");
      if (!box) return;
      let timer = null;
      async function refresh() {
        try {
          const res = await fetch("/now", { cache: "no-store" });
          if (!res.ok) return;
          const html = (await res.text()).trim();
          if (html !== box.innerHTML.trim()) box.innerHTML = html;
        } catch {}
      }
      const start = () => { if (!timer) timer = setInterval(refresh, 30000); };
      const stop = () => { clearInterval(timer); timer = null; };
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stop(); else { refresh(); start(); }
      });
      if (!document.hidden) start();
    })();
  </script>` : ""}
  ${c.easterEgg ? `<script>
    (() => {
      // Easter egg: Konami code (↑ ↑ ↓ ↓ ← → ← → B A) or three quick clicks on the avatar → leek rain + jingle.
      // Pixel art sprites (leek and Miku-style negi), each falling one picks one at random.
      const SPRITES = ${jsonForScript(LEEK_SPRITES)};
      let raining = false;

      // A short chiptune arpeggio, made on the fly with the Web Audio API (no sound file).
      function jingle() {
        try {
          const audio = new (window.AudioContext || window.webkitAudioContext)();
          const notes = [880, 1108.73, 1318.51, 1760, 1318.51, 1760];
          notes.forEach((freq, i) => {
            const start = audio.currentTime + i * 0.085;
            const osc = audio.createOscillator();
            const gain = audio.createGain();
            osc.type = i % 2 ? "triangle" : "square";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.06, start);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
            osc.connect(gain).connect(audio.destination);
            osc.start(start);
            osc.stop(start + 0.17);
          });
          setTimeout(() => audio.close(), 1200);
        } catch {}
      }

      function leekRain() {
        if (raining) return;
        raining = true;
        jingle();
        setTimeout(() => (raining = false), 5000);
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        for (let i = 0; i < 36; i++) {
          const leek = document.createElement("div");
          leek.className = "leek";
          const [svg, width] = SPRITES[Math.floor(Math.random() * SPRITES.length)];
          leek.innerHTML = svg;
          leek.style.width = width + "px";
          leek.style.left = Math.random() * 100 + "vw";
          leek.style.setProperty("--fall", 2.2 + Math.random() * 2 + "s");
          leek.style.setProperty("--drift", (Math.random() - 0.5) * 160 + "px");
          leek.style.setProperty("--spin", (Math.random() - 0.5) * 1080 + "deg");
          leek.style.animationDelay = Math.random() * 1.2 + "s";
          leek.addEventListener("animationend", () => leek.remove());
          document.body.append(leek);
        }
      }

      const code = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
      let pos = 0;
      addEventListener("keydown", (e) => {
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        // A wrong key restarts the code; an extra ↑ keeps the two ↑ typed so far.
        pos = key === code[pos] ? pos + 1 : key === code[0] ? (pos === 2 ? 2 : 1) : 0;
        if (pos === code.length) { pos = 0; leekRain(); }
      });

      const avatar = document.querySelector(".avatar");
      let clicks = [];
      avatar?.addEventListener("click", () => {
        const now = Date.now();
        clicks = clicks.filter((t) => now - t < 700).concat(now);
        if (clicks.length >= 3) { clicks = []; leekRain(); }
      });
    })();
  </script>` : ""}
  ${entrance ? `<script>
    (() => {
      const body = document.body;
      // Fade the background in only once the image is fully decoded, even if that is after the loader.
      const bgImage = ${bg.image ? JSON.stringify(safeUrl(bg.image)).replace(/</g, "\\u003c") : "null"};
      const bgReady = () => body.classList.add("bg-ready");
      if (bgImage) {
        const img = new Image();
        img.src = bgImage;
        img.decode().then(bgReady, bgReady);
      } else {
        bgReady();
      }
      ${loader ? `// Show the loader for at least a moment so it doesn't just flash, but not forever on slow connections.
      const ready = () => body.classList.add("ready");
      const done = () => setTimeout(ready, Math.max(0, ${Number(animation.minDuration ?? 700)} - performance.now()));
      if (document.readyState === "complete") done(); else addEventListener("load", done);
      setTimeout(ready, ${Number(animation.maxDuration ?? 4000)});` : ""}
    })();
  </script>` : ""}
</body>
</html>`;
}
