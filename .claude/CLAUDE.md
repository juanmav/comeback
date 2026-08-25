# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static sale page (`index.html`) for listing items for sale before the owners move to Barcelona. No dependencies, no framework — just vanilla HTML/CSS/JS served via GitHub Pages. The catalog itself is one self-contained file; the only generated output is the per-item pages under `item/` (see below), built by `build-items.js` with plain Node, no npm install.

**Custom domain:** [adios.com.ar](https://adios.com.ar) (configured via `CNAME` file). Also accessible at the GitHub Pages default URL https://juanmav.github.io/comeback/.

## Deploying changes

After editing `index.html`, **always regenerate the per-item pages** and then push to master — GitHub Pages auto-deploys:

```bash
node build-items.js
git add index.html item sitemap.xml robots.txt 404.html
git commit -m "..."
TOKEN=$(gh auth token) && git remote set-url origin "https://${TOKEN}@github.com/juanmav/comeback.git"
git push
```

SSH is not available in this environment — always use the HTTPS + gh token method above.

## Adding or updating items

All items live in the `ITEMS` array near the top of the `<script>` block in `index.html`. Each entry:

```js
{
  id: <unique number>,
  nombre: "...",
  descripcion: "...",           // 1-2 sentences
  precio: { ars: null, usd: null, eur: null },  // null omits that currency; all null → "Precio a consultar"
  condicion: "Nuevo" | "Como nuevo" | "Buen estado" | "Regular" | "A reparar",
  categoria: "...",             // drives the filter buttons automatically
  vendido: false,               // true greys out the card and disables WhatsApp button
  imagen: "https://...",        // direct CDN image URL; null shows a 📦 placeholder
  url: "https://..."            // shown as "Ver ficha técnica oficial" link; null hides it
}
```

When the user provides a product reference, search for the official page and its product image before adding the item.

**Regla: siempre bajar la foto.** Never point `imagen` at a third-party CDN URL for a new item — download the photo into `images/` (e.g. `curl -sL -o images/<slug>.jpg <cdn-url>`), reference the local path, and commit the image file. Third-party hosts (Amazon especially) hotlink-block the WhatsApp/Facebook scrapers and the preview loses its photo; serving from our own domain avoids that for good.

## Per-item pages (`item/<id>.html`) — link previews

`build-items.js` generates one standalone page per item so that a shared link shows that product's own photo, name and price in the WhatsApp/Facebook/LinkedIn preview, plus `Product` JSON-LD so Google can index each item separately. It also writes `sitemap.xml`, `robots.txt` and `404.html`.

### Rules

- **Every item gets a page**, including reserved and sold ones — the links are used to pass reservation lists with photo and description. Reserved/sold pages carry a RESERVADO/VENDIDO banner, no WhatsApp button, `<meta name="robots" content="noindex">`, a `[RESERVADO]`/`[VENDIDO]` prefix in the title/og:title, and are excluded from `sitemap.xml` (only available items are listed there).
- **Run `node build-items.js` after ANY change to `ITEMS`** — adding, removing, repricing, changing photos, and especially flipping `reservado`/`vendido`. A stale `item/` directory means wrong prices or a reserved item still looking available.
- `index.html` is the single source of truth. The script parses `ITEMS`, `COND_DOT`, `CAT_ICONS` and `FMT` straight out of it — never duplicate item data into the generator. If those declarations are reformatted, the regexes in `grab()` may need updating (the script throws a clear error if extraction fails).
- The card's "Compartir" button (`shareItem` in `index.html`) always links to `item/<id>.html`.
- `og:image` uses the item's first photo. Photos under `images/` are served from our own domain (safest); third-party CDN URLs work too but can be hotlink-blocked by the origin, which shows up as a preview with no image. Items with no photo fall back to `images/og-cover.jpg`.

## Link previews on the catalog page

The `<head>` of `index.html` carries the Open Graph / Twitter Card tags for the catalog itself, pointing at `images/og-cover.jpg` (1200×630, kept under 300 KB because WhatsApp drops larger previews). The cover was rendered from an HTML mock with headless Chromium — regenerate it if the branding changes.

After deploying a change to any preview, refresh the scrapers' caches: Facebook Sharing Debugger and LinkedIn Post Inspector re-scrape on demand; WhatsApp caches per URL, so append a `?v=N` to force a refetch.

### TODO — only if a preview actually comes back without an image

(For **existing** items only — new items always get their photo downloaded into `images/` from the start, per the rule in "Adding or updating items".)

57 of the 88 available items use a third-party CDN as their `og:image` (36 `m.media-amazon.com`, 13 `http2.mlstatic.com`, plus a few LG / IKEA / Steelcase / Spider Farmer). Those hosts can refuse the scraper's request, and the symptom is a preview with title and description but no photo — Amazon is the likeliest offender.

Don't pre-emptively fix all of them. When a specific item's preview shows up empty, download just that photo into `images/`, point the item's `imagen` at the local path, and re-run `node build-items.js`. Serving it from our own domain removes the problem for good.

## WhatsApp integration

The number is hardcoded as `const WA = "5491160432525"` (Argentine format, no `+` or spaces). Each card's button pre-fills the message: *"Hola! Me interesa "[nombre]" que vi en su lista. ¿Está disponible?"*

## Item flags

Beyond the base schema, items support these optional boolean flags:

```js
reservado: true,      // shows RESERVADO badge, disables WhatsApp button
vendido: true,        // shows VENDIDO badge, greys out card
entregaTardia: true,  // shows "Entrega tardía · aprox. 7 al 21 de septiembre" chip (hidden when reservado)
sinUso: true,         // shows green "✨ Sin uso" chip
enCaja: true,         // shows amber "📦 En caja" chip
mlUsado: true,        // the item's ML link points to a USED listing: card link reads "Ver publicación en MercadoLibre" instead of "Ver precio de nuevo en MercadoLibre"
```

The card link label is automatic: URLs containing `mercadolibre` render "Ver precio de nuevo en MercadoLibre" (or the `mlUsado` variant); any other URL renders "Ver ficha técnica oficial".

## Reservations tracker (reservas.md)

`reservas.md` is an internal tracking file, but it **must stay tracked in git and be committed/pushed with every change** — Natu edits it from another machine, so git is the sync channel. Never remove it from the repo or add it to `.gitignore`. Trade-off to be aware of: the repo deploys via GitHub Pages, so the file is technically reachable at `adios.com.ar/reservas.md`; `robots.txt` carries a `Disallow: /reservas.md` to keep it out of search engines, and it must never be linked from any page.

### Structure

One `##` section per buyer. Each section has:
1. A table with columns `ID | Producto | Precio ARS | Reservado`
2. A **Total** line summing all items
3. A status table with rows: Seña, Entrega, Notas

### Rules

- **ID** must match the `id` field in the `ITEMS` array — always cross-reference.
- When a reservation is added, set `reservado: true` on the corresponding item(s) in `index.html`, run `node build-items.js` (this removes their per-item pages) and push to the web.
- When splitting a multi-unit item (e.g. "(x2)"), create a new entry with the next available ID, update both `index.html` and `reservas.md`.
- **Totals must be recalculated** whenever items are added, removed, or repriced in a section.
- Include context notes in the buyer header when relevant (e.g. "vía Anibal", "novia de Carlitos").

### Current buyers

| Comprador | Ítems | Total |
|-----------|-------|-------|
| Anibal | 12 | $859.000 |
| Ariel | 2 (BEKANT x2) | $715.000 |
| Amira (novia de Carlitos, vía Anibal) | 2 | $178.700 |
| Ruben | 5 | $332.900 |

## Scraping product links

When the user provides product URLs to add as items, **always use `playwright-cli`** to scrape them — Amazon and most e-commerce sites block WebFetch because they render prices and images via JavaScript.

### MercadoLibre — usar Chrome MCP obligatoriamente

MercadoLibre bloquea playwright con 403 (bot detection). Para cualquier URL de `mercadolibre.com.ar`:

1. **Usar `mcp__claude-in-chrome__*`** en lugar de playwright-cli.
2. Verificar que Chrome esté corriendo: `ps aux | grep /opt/google/chrome/chrome | grep -v grep`
3. Si Chrome no está corriendo, iniciarlo: `google-chrome --new-window &` y esperar ~4 segundos.
4. Si Chrome estaba corriendo con playwright (perfil bloqueado) y el MCP no conecta, reiniciarlo:
   ```bash
   pkill -TERM -f "/opt/google/chrome/chrome"
   sleep 3
   google-chrome --new-window &
   sleep 4
   ```
5. Conectar con `mcp__claude-in-chrome__tabs_context_mcp`, crear tab, navegar y extraer con `mcp__claude-in-chrome__javascript_tool`.

Para imágenes de ML, preferir URLs con sufijo `-O.webp` o `-O.jpg` (full res) en lugar de `-R.webp` (thumbnail). Usar `D_NQ_NP_` sobre `D_Q_NP_` cuando esté disponible.

```bash
# Check if available
which playwright-cli || npx playwright-cli --version

# If not installed
npm install -g @playwright/cli
# or use npx: npx playwright-cli <command>
```

Typical scraping flow per URL:
1. `playwright-cli goto <url>` — navigate and wait for JS render
2. `playwright-cli eval "document.querySelector('#productTitle')?.textContent?.trim()"` — extract title
3. `playwright-cli eval "document.querySelector('#landingImage')?.getAttribute('data-old-hires') || document.querySelector('#landingImage')?.src"` — extract image
4. `playwright-cli snapshot` — save YAML snapshot, then `grep -o '€[0-9]*[,.][0-9]*' <snapshot>` to extract price
5. `playwright-cli goto <next-url>` — reuse the same browser session for all URLs

Close when done: `playwright-cli close`

## Architecture notes

Everything is self-contained in `index.html`:
- **Styles**: CSS custom properties at the top of `<style>` control colors/radius.
- **Data**: `ITEMS` array — edit here only.
- **Rendering**: `render()` filters by active category + search query and rewrites `#grid` innerHTML. Called on input events and category clicks.
- **Categories**: generated dynamically from `item.categoria` values — no manual maintenance needed.
