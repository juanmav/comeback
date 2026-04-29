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

## Architecture notes

Everything is self-contained in `index.html`:
- **Styles**: CSS custom properties at the top of `<style>` control colors/radius.
- **Data**: `ITEMS` array — edit here only.
- **Rendering**: `render()` filters by active category + search query and rewrites `#grid` innerHTML. Called on input events and category clicks.
- **Categories**: generated dynamically from `item.categoria` values — no manual maintenance needed.
