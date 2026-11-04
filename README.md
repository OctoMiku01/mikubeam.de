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

### Projekt-Infos von GitHub

Zeigt ein Link auf ein GitHub-Repo (`https://github.com/Owner/Repo`), holt der Worker automatisch die neueste Version pro Minecraft-Version, Sterne und Downloads (ohne `-sources.jar`) und zeigt sie unter der Beschreibung, z. B. `v0.5.7 · MC 26.3` `v0.4.17 · MC 26.2` `★ 1` `↓ 56`.

- Die MC-Version kommt aus dem Release-Tag (`v0.5.7-26.3`), sonst aus dem Release-Namen („… Minecraft 26.3“ / „… for 26.3“) oder dem Dateinamen (`mc26.3`). Pre-Releases zählen nur bei den Downloads.
- `"repo": "Owner/Repo"` am Link setzt das Repo von Hand, `"stats": false` schaltet die Zeile ab.
- Die Daten werden im Cloudflare-Cache gehalten und höchstens einmal pro Stunde im Hintergrund aktualisiert. Ist GitHub nicht erreichbar, bleiben die letzten Werte (bis zu 7 Tage) stehen, ganz ohne Daten wird die Zeile einfach weggelassen.
- **Token (empfohlen):** Ohne Anmeldung erlaubt GitHub nur 60 Anfragen pro Stunde, und die teilen sich alle Worker auf derselben Cloudflare-IP. Einen [Fine-grained Token](https://github.com/settings/personal-access-tokens/new) mit „Public repositories (read-only)“ und ohne weitere Rechte anlegen und im Cloudflare-Dashboard unter *Worker → Settings → Variables and Secrets* als Secret `GITHUB_TOKEN` eintragen. Lokal geht das über eine `.dev.vars`-Datei mit `GITHUB_TOKEN=…`.

### Icons

- **Marken-Icons**: jeder Slug von [simpleicons.org](https://simpleicons.org), z. B. `github`, `discord`, `youtube`, `twitch`, `x`, `bluesky`, `instagram`, `tiktok`, `modrinth`, `curseforge`, `kofi`, `steam`
- **Eingebaut**: `mail`, `link`, `globe`, `heart`
- **Eigenes Bild**: URL oder Pfad wie `/icons/foo.png` oder `/icons/foo.svg`
  - SVGs werden automatisch in der Textfarbe eingefärbt (wie die Marken-Icons), andere Formate behalten ihre Farben.
  - Mit `"tint": false` behält ein SVG seine Originalfarben, mit `"tint": true` wird auch ein PNG eingefärbt (es zählt nur die Form, also die nicht-transparenten Pixel).
  - Einfärben klappt nur mit Dateien aus `public/` (oder Servern, die CORS erlauben) – fremde Bilder wie Favicons bleiben sonst leer.
- **Favicon einer Website**: `https://www.google.com/s2/favicons?domain=example.com&sz=64`

### Eigene Bilder

Favicon: `public/favicon.png` (192 px) und `public/apple-touch-icon.png` (180 px, für iOS), `/favicon.ico` leitet auf `favicon.png` um. Embed-Banner: `public/banner.jpg` (1200×630) wird von [`scripts/banner.mjs`](scripts/banner.mjs) automatisch aus `config.json` erzeugt (Titel, `meta.siteName`, Bio, Avatar, Hintergrundbild, Akzentfarbe, Schrift) – vor jedem `npm run dev` und `npm run deploy`, oder von Hand mit `npm run banner`. Braucht beim Erzeugen Internet (Schrift von Google Fonts, Avatar-URL). Die Bild-URL im Embed bekommt eine Prüfsumme der Config angehängt (`?v=…`), damit Discord nach Änderungen das neue Bild lädt.

Dateien einfach in `public/` legen (z. B. `public/avatar.png`, `public/bg.jpg`) und in der Config mit `/avatar.png` bzw. `/bg.jpg` referenzieren.
