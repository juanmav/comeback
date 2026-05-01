# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file static sale page (`index.html`) for listing items for sale before the owners move to Barcelona. No build step, no dependencies, no framework — just vanilla HTML/CSS/JS served via GitHub Pages at **https://juanmav.github.io/comeback/**.

## Deploying changes

After editing `index.html`, push to master and GitHub Pages auto-deploys:

```bash
git add index.html
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

When the user provides a product reference, search for the official page and a direct CDN image URL before adding the item.

## WhatsApp integration

The number is hardcoded as `const WA = "5491160432525"` (Argentine format, no `+` or spaces). Each card's button pre-fills the message: *"Hola! Me interesa "[nombre]" que vi en su lista. ¿Está disponible?"*

## Item flags

Beyond the base schema, items support these optional boolean flags:

```js
reservado: true,      // shows RESERVADO badge, disables WhatsApp button
vendido: true,        // shows VENDIDO badge, greys out card
entregaTardia: true,  // shows "Entrega tardía · A acordar" chip (hidden when reservado)
```

## Reservations tracker (reservas.md)

`reservas.md` is an internal file — **never deploy it to the web**, it's for tracking only.

### Structure

One `##` section per buyer. Each section has:
1. A table with columns `ID | Producto | Precio ARS | Reservado`
2. A **Total** line summing all items
3. A status table with rows: Seña, Entrega, Notas

### Rules

- **ID** must match the `id` field in the `ITEMS` array — always cross-reference.
- When a reservation is added, set `reservado: true` on the corresponding item(s) in `index.html` and push to the web.
- When splitting a multi-unit item (e.g. "(x2)"), create a new entry with the next available ID, update both `index.html` and `reservas.md`.
- **Totals must be recalculated** whenever items are added, removed, or repriced in a section.
- Include context notes in the buyer header when relevant (e.g. "vía Anibal", "novia de Carlitos").

### Current buyers

| Comprador | Ítems | Total |
|-----------|-------|-------|
| Anibal | 13 | $887.500 |
| Ariel | 2 (BEKANT x2) | $715.000 |
| Amira (novia de Carlitos, vía Anibal) | 2 | $178.700 |
| Ruben | 5 | $332.900 |

## Architecture notes

Everything is self-contained in `index.html`:
- **Styles**: CSS custom properties at the top of `<style>` control colors/radius.
- **Data**: `ITEMS` array — edit here only.
- **Rendering**: `render()` filters by active category + search query and rewrites `#grid` innerHTML. Called on input events and category clicks.
- **Categories**: generated dynamically from `item.categoria` values — no manual maintenance needed.
