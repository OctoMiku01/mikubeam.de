// Builds public/banner.jpg (1200×630 embed image for Discord, X, ...) from config.json.
// Runs automatically before `wrangler dev` and `wrangler deploy` (see "build" in wrangler.jsonc),
// or by hand with `npm run banner`.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const config = JSON.parse(await readFile(new URL("config.json", root), "utf8"));
const WIDTH = 1200;
const HEIGHT = 630;

// Images can be URLs or paths to files in public/ (like "/bg.jpg").
async function loadImage(src) {
  if (/^https?:/i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Could not load ${src}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(new URL(`public/${src.replace(/^\//, "")}`, root));
}

// Google Fonts hands out TTF files (which satori needs) to clients without a browser user agent.
async function loadFont(family, weight) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`;
  const css = await (await fetch(cssUrl)).text();
  const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
  if (!url) throw new Error(`Font "${family}" (${weight}) not found on Google Fonts`);
  return (await fetch(url)).arrayBuffer();
}

const dataUri = (buffer, type) => `data:${type};base64,${buffer.toString("base64")}`;

// Mixes a #rrggbb color with white, used for the brighter accent text.
function lighten(hex, amount) {
  const n = parseInt(hex.replace("#", ""), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

const h = (type, style, children = []) => ({ type, props: { style, children } });

const theme = config.theme ?? {};
const meta = config.meta ?? {};
const accent = /^#[0-9a-f]{6}$/i.test(theme.accent ?? "") ? theme.accent : "#39c5bb";
const family = theme.font && theme.font !== "system" ? theme.font : "Inter";
const bgSource = config.background?.image;

const [background, avatar, fontRegular, fontBold] = await Promise.all([
  // Crop the background to exactly 1200×630 up front, so the renderer doesn't handle a huge image.
  bgSource
    ? loadImage(bgSource).then((img) => sharp(img).resize(WIDTH, HEIGHT, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer())
    : null,
  config.avatar
    ? loadImage(config.avatar).then((img) => sharp(img).resize(264, 264, { fit: "cover" }).png().toBuffer())
    : null,
  loadFont(family, 500),
  loadFont(family, 800),
]);

const bio = String(config.bio ?? "").replace(/\s*\n\s*/g, " ").trim();
const subtitle = [meta.siteName, bio].filter(Boolean);
const shadow = "0 3px 14px rgba(0,0,0,0.5)";

const tree = h(
  "div",
  {
    width: WIDTH,
    height: HEIGHT,
    display: "flex",
    position: "relative",
    fontFamily: family,
    color: "#ffffff",
    // Fallback when no background image is set.
    backgroundColor: config.background?.color ?? "#0f1724",
    backgroundImage: config.background?.gradient,
  },
  [
    background &&
      { type: "img", props: { src: dataUri(background, "image/jpeg"), width: WIDTH, height: HEIGHT, style: { position: "absolute", left: 0, top: 0 } } },
    h("div", {
      position: "absolute",
      left: 0,
      top: 0,
      width: WIDTH,
      height: HEIGHT,
      backgroundImage: "linear-gradient(to top, rgba(15,23,36,0.92) 0%, rgba(15,23,36,0.65) 26%, rgba(15,23,36,0) 52%)",
    }),
    h("div", { position: "absolute", left: 56, bottom: 48, right: 56, display: "flex", alignItems: "center" }, [
      avatar &&
        {
          type: "img",
          props: {
            src: dataUri(avatar, "image/png"),
            width: 132,
            height: 132,
            style: {
              borderRadius: 999,
              border: `5px solid ${accent}`,
              boxShadow: `0 0 0 6px ${accent}40, 0 10px 30px rgba(0,0,0,0.45)`,
              marginRight: 28,
              flexShrink: 0,
            },
          },
        },
      h("div", { display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 }, [
        h("div", { fontSize: 68, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1, textShadow: shadow }, meta.title || config.name),
        subtitle.length &&
          h("div", { display: "flex", flexWrap: "wrap", marginTop: 12, fontSize: 28, fontWeight: 500, lineHeight: 1.3, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }, [
            meta.siteName && h("span", { color: lighten(accent, 0.25), fontWeight: 800 }, meta.siteName),
            bio && h("span", { opacity: 0.92 }, `${meta.siteName ? " · " : ""}${bio}`),
          ].filter(Boolean)),
      ].filter(Boolean)),
    ].filter(Boolean)),
  ].filter(Boolean),
);

const svg = await satori(tree, {
  width: WIDTH,
  height: HEIGHT,
  fonts: [
    { name: family, data: fontRegular, weight: 500, style: "normal" },
    { name: family, data: fontBold, weight: 800, style: "normal" },
  ],
});
const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng();
const out = new URL("public/banner.jpg", root);
await writeFile(out, await sharp(png).jpeg({ quality: 88, mozjpeg: true }).toBuffer());
console.log(`Banner written to ${fileURLToPath(out)}`);
