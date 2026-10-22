import config from "../config.json";

export default {
  async fetch(request) {
    const { pathname, origin } = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (pathname === "/" || pathname === "/index.html") {
      return new Response(renderPage(config, origin), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=300",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
        },
      });
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

function renderLink(link, anim) {
  if (link.type === "header") {
    return `<h2 class="section"${anim()}>${esc(link.label)}</h2>`;
  }
  const url = safeUrl(link.url);
  const target = isExternal(url) ? ' target="_blank" rel="noopener noreferrer"' : "";
  const classes = ["link", link.highlight ? "highlight" : ""].filter(Boolean).join(" ");
  return `<a class="${classes}" href="${esc(url)}"${target}${anim()}>
        ${renderIcon(link.icon, link.tint)}
        <span class="link-text">
          <span class="link-label">${esc(link.label)}</span>
          ${link.description ? `<span class="link-desc">${esc(link.description)}</span>` : ""}
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

function renderPage(c, origin) {
  const theme = c.theme ?? {};
  const bg = c.background ?? {};
  const meta = c.meta ?? {};
  const title = meta.title || c.name;
  const description = meta.description || c.bio || "";
  const themeColor = meta.themeColor || theme.accent || bg.color || "#000000";
  // A dedicated meta.image is shown as a large banner, otherwise the avatar as a small thumbnail.
  const ogImage = meta.image || c.avatar;
  const font = theme.font && theme.font !== "system" ? theme.font : null;
  const animation = c.animation ?? {};
  const entrance = animation.entrance !== false;
  const loader = entrance && animation.loader !== false;
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

  const bio = esc(c.bio).replace(/\n/g, "<br>");

  return `<!doctype html>
<html lang="${esc(meta.lang || "de")}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="${esc(css(themeColor))}">
  <meta property="og:type" content="profile">
  <meta property="og:url" content="${esc(origin)}/">
  ${meta.siteName ? `<meta property="og:site_name" content="${esc(meta.siteName)}">` : ""}
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  ${ogImage ? `<meta property="og:image" content="${esc(absoluteUrl(ogImage, origin))}">` : ""}
  <meta name="twitter:card" content="${meta.image ? "summary_large_image" : "summary"}">
  ${c.avatar ? `<link rel="icon" href="${esc(safeUrl(c.avatar))}">` : ""}
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
  <main>
    ${c.avatar ? `<img class="avatar" src="${esc(safeUrl(c.avatar))}" alt="${esc(c.name)}" width="112" height="112"${anim("avatar")}>` : ""}
    <h1${anim()}>${esc(c.name)}</h1>
    ${c.handle ? `<p class="handle"${anim()}>${esc(c.handle)}</p>` : ""}
    ${c.bio ? `<p class="bio"${anim()}>${bio}</p>` : ""}
    ${c.socials?.length ? `<nav class="socials" aria-label="Social Media">
      ${c.socials.map((s) => renderSocial(s, anim)).join("\n      ")}
    </nav>` : ""}
    <div class="links">
      ${(c.links ?? []).map((l) => renderLink(l, anim)).join("\n      ")}
    </div>
    ${c.footer ? `<footer${anim()}>${esc(c.footer)}</footer>` : ""}
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
