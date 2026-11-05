// Downloads everything the page would otherwise load from other servers – Google Fonts, Simple Icons
// brand icons and the avatar – into public/generated/, so visitors only ever talk to mikubeam.de.
// Writes src/generated/assets.json with the local paths for the worker.
// Runs before every `wrangler dev` / `wrangler deploy` (see "build" in wrangler.jsonc).
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const config = JSON.parse(await readFile(new URL("config.json", root), "utf8"));
const outDir = new URL("public/generated/", root);
const manifestFile = new URL("src/generated/assets.json", root);

// Icons the worker draws itself (keep in sync with BUILTIN_ICONS in src/worker.js).
const BUILTIN_ICONS = new Set(["mail", "link", "globe", "heart", "download", "package", "arrow-left", "rss"]);
// A browser user agent, so Google Fonts serves woff2 files.
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

async function download(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  return res;
}

const shortHash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);

await rm(outDir, { recursive: true, force: true });
await mkdir(new URL("fonts/", outDir), { recursive: true });
await mkdir(new URL("icons/", outDir), { recursive: true });
await mkdir(new URL("src/generated/", root), { recursive: true });

const manifest = { fonts: null, avatar: null, icons: {} };

// Fonts: the theme font plus the retro font of the visitor counter.
const theme = config.theme ?? {};
const families = [
  theme.font && theme.font !== "system" && `family=${encodeURIComponent(theme.font)}:wght@400;500;600;700`,
  config.counter && "family=VT323",
].filter(Boolean);
if (families.length) {
  let css = await (await download(`https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`, { "user-agent": BROWSER_UA })).text();
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
  await Promise.all(urls.map(async (url) => {
    const file = `${shortHash(url)}.woff2`;
    await writeFile(new URL(`fonts/${file}`, outDir), Buffer.from(await (await download(url)).arrayBuffer()));
    css = css.replaceAll(url, `/generated/fonts/${file}`);
  }));
  await writeFile(new URL("fonts.css", outDir), css);
  manifest.fonts = "/generated/fonts.css";
  console.log(`Fonts: ${urls.length} files`);
}

// Brand icons from Simple Icons, for every icon name used in socials and links.
const slugs = new Set(
  [...(config.socials ?? []), ...(config.links ?? [])]
    .map((item) => item.icon)
    .filter((icon) => icon && !BUILTIN_ICONS.has(icon) && !/^(https?:|\/)/.test(icon))
    .map((icon) => icon.toLowerCase().replace(/[^a-z0-9]/g, "")),
);
slugs.add("github"); // used by the /mods page
await Promise.all([...slugs].map(async (slug) => {
  const svg = await (await download(`https://cdn.simpleicons.org/${slug}`)).text();
  await writeFile(new URL(`icons/${slug}.svg`, outDir), svg);
  manifest.icons[slug] = `/generated/icons/${slug}.svg`;
}));
console.log(`Icons: ${[...slugs].join(", ")}`);

// Avatar, if it points to another server.
if (/^https?:/i.test(config.avatar ?? "")) {
  const res = await download(config.avatar);
  const type = res.headers.get("content-type") || "";
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
  await writeFile(new URL(`avatar.${ext}`, outDir), Buffer.from(await res.arrayBuffer()));
  manifest.avatar = `/generated/avatar.${ext}`;
  console.log(`Avatar: ${manifest.avatar}`);
}

await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
