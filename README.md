# mikubeam.de

Persönliche Link-Seite (à la Linktree) als Cloudflare Worker. Die Seite wird serverseitig aus [`config.json`](config.json) gerendert – kein Build-Schritt, kein JavaScript im Browser.

## Lokal starten

```sh
npm install
npm run dev      # http://localhost:8787
```

## Deployen

```sh
npx wrangler login   # einmalig
npm run deploy
```

Danach läuft die Seite unter `https://mikubeam.<dein-account>.workers.dev`. Für die eigene Domain die `routes`-Zeile in [`wrangler.jsonc`](wrangler.jsonc) einkommentieren (die Zone `mikubeam.de` muss dafür in Cloudflare liegen) – oder im Dashboard unter *Worker → Settings → Domains & Routes* hinzufügen.

Alternativ: Repo im Cloudflare-Dashboard unter *Workers & Pages → Create → Import a repository* verbinden, dann deployt jeder Push auf `main` automatisch.

## Konfiguration (`config.json`)

| Feld | Beschreibung |
|---|---|
| `name`, `handle` | Name und Untertitel unter dem Profilbild |
| `bio` | Bio-Text, `\n` für Zeilenumbruch |
| `avatar` | Bild-URL oder Pfad zu einer Datei in `public/` (z. B. `/avatar.png`) |
| `meta.title`, `meta.description`, `meta.lang` | Browser-Titel und Vorschau in Discord/Twitter etc. |
| `meta.siteName` | Kleine Zeile über dem Titel im Embed |
| `meta.image` | Großes Banner-Bild im Embed (ideal 1200×630). Leer = Avatar als kleines Vorschaubild |
| `meta.themeColor` | Farbe des Embed-Balkens. Leer = `theme.accent` |
| `theme.text` | Textfarbe |
| `theme.accent` | Akzentfarbe (Avatar-Rand, Hover, hervorgehobene Buttons) |
| `theme.buttonStyle` | `glass`, `solid` oder `outline` |
| `theme.radius` | Ecken-Rundung der Buttons, z. B. `14px` oder `999px` |
| `theme.font` | Google-Fonts-Name (z. B. `Inter`, `Poppins`) oder `system` |
| `animation.loader` | Lade-Overlay mit drehendem Ring um den Avatar (`true`/`false`) |
| `animation.entrance` | Elemente nacheinander einblenden (`true`/`false`, `false` schaltet auch den Loader ab) |
| `animation.minDuration` | Mindestanzeigedauer des Loaders in ms, damit er nicht nur kurz aufblitzt |
| `animation.maxDuration` | Spätestens nach so vielen ms verschwindet der Loader; ein noch ladender Hintergrund blendet danach ein |
| `background.color` | Grundfarbe |
| `background.gradient` | CSS-Verlauf, wird genutzt wenn kein Bild gesetzt ist |
| `background.image` | Hintergrundbild (URL oder `/bg.jpg` aus `public/`) |
| `background.blur` | Weichzeichner in px fürs Hintergrundbild |
| `background.dim` | Abdunkelung `0`–`1` für bessere Lesbarkeit |
| `socials` | Icon-Reihe unter der Bio: `{ "icon", "url", "label" }` |
| `links` | Buttons: `{ "label", "url", "icon", "description", "highlight" }` oder Zwischenüberschrift `{ "type": "header", "label" }` |
| `footer` | Text ganz unten (optional) |

### Icons

- **Marken-Icons**: jeder Slug von [simpleicons.org](https://simpleicons.org), z. B. `github`, `discord`, `youtube`, `twitch`, `x`, `bluesky`, `instagram`, `tiktok`, `modrinth`, `curseforge`, `kofi`, `steam`
- **Eingebaut**: `mail`, `link`, `globe`, `heart`
- **Eigenes Bild**: URL oder Pfad wie `/icons/foo.png` oder `/icons/foo.svg`
  - SVGs werden automatisch in der Textfarbe eingefärbt (wie die Marken-Icons), andere Formate behalten ihre Farben.
  - Mit `"tint": false` behält ein SVG seine Originalfarben, mit `"tint": true` wird auch ein PNG eingefärbt (es zählt nur die Form, also die nicht-transparenten Pixel).
  - Einfärben klappt nur mit Dateien aus `public/` (oder Servern, die CORS erlauben) – fremde Bilder wie Favicons bleiben sonst leer.
- **Favicon einer Website**: `https://www.google.com/s2/favicons?domain=example.com&sz=64`

### Eigene Bilder

Dateien einfach in `public/` legen (z. B. `public/avatar.png`, `public/bg.jpg`) und in der Config mit `/avatar.png` bzw. `/bg.jpg` referenzieren.
