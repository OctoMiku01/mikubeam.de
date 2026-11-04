import config from "../config.json";
import { getAllStats, linkRepo } from "./github.js";

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
      const stats = await getAllStats(config.links ?? [], env, ctx);
      return new Response(renderPage(config, origin, page(config, stats)), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=300",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
        },
      });
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
function homePage(c, stats) {
  const bio = esc(c.bio).replace(/\n/g, "<br>");
  return {
    path: "/",
    loader: true,
    content: (anim) => `
    ${c.avatar ? `<img class="avatar" src="${esc(safeUrl(c.avatar))}" alt="${esc(c.name)}" width="112" height="112"${anim("avatar")}>` : ""}
    <h1${anim()}>${esc(c.name)}</h1>
    ${c.handle ? `<p class="handle"${anim()}>${esc(c.handle)}</p>` : ""}
    ${c.bio ? `<p class="bio"${anim()}>${bio}</p>` : ""}
    ${c.socials?.length ? `<nav class="socials" aria-label="Social Media">
      ${c.socials.map((s) => renderSocial(s, anim)).join("\n      ")}
    </nav>` : ""}
    <div class="links">
      ${(c.links ?? []).map((l) => renderLink(l, anim, stats)).join("\n      ")}
    </div>
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
  ${font ? `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;700&display=swap">` : ""}
  <style>
    :root {
      --text: ${css(theme.text || "#ffffff")};
      --accent: ${css(theme.accent || "#39c5bb")};
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
      color: #fff;
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
    .link.highlight { background: var(--accent); border-color: var(--accent); color: #fff; }
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
  <main${page.wide ? ' class="wide"' : ""}>${page.content(anim)}
  </main>
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
