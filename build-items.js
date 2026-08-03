#!/usr/bin/env node
/**
 * build-items.js — generador de páginas por ítem.
 *
 * Crea item/<id>.html para cada artículo, con sus propios meta tags
 * (Open Graph / Twitter Card) y JSON-LD de Product, más sitemap.xml,
 * robots.txt y 404.html.
 *
 * REGLA: se generan páginas para TODOS los ítems, pero los reservados y
 * vendidos llevan banner de estado (RESERVADO/VENDIDO), sin botón de
 * WhatsApp, con <meta name="robots" content="noindex"> y quedan fuera del
 * sitemap. Así el link sirve para pasar reservas con foto y descripción,
 * sin que el ítem parezca disponible ni lo indexe Google.
 * El directorio item/ se borra y se regenera en cada corrida.
 *
 * Uso:  node build-items.js
 *
 * Los datos se leen de index.html (única fuente de verdad): no dupliques
 * ITEMS acá.
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SITE = "https://adios.com.ar";
const OUT_DIR = path.join(ROOT, "item");
const WA = "5491160432525";
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%8F%B7%3C/text%3E%3C/svg%3E";

const CONDITION_SCHEMA = {
  "Nuevo": "https://schema.org/NewCondition",
  "Como nuevo": "https://schema.org/UsedCondition",
  "Buen estado": "https://schema.org/UsedCondition",
  "Regular": "https://schema.org/UsedCondition",
  "A reparar": "https://schema.org/DamagedCondition",
};

// ── Datos: se extraen de index.html y se evalúan tal cual ──
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function grab(name, re) {
  const m = src.match(re);
  if (!m) throw new Error(`No pude extraer ${name} de index.html — ¿cambió el formato?`);
  return m[0];
}

const { ITEMS, COND_DOT, CAT_ICONS, FMT } = eval(`(() => {
  ${grab("ITEMS", /const ITEMS\s*=\s*\[[\s\S]*?\n\];/)}
  ${grab("COND_DOT", /const COND_DOT\s*=\s*\{[\s\S]*?\n\};/)}
  ${grab("CAT_ICONS", /const CAT_ICONS\s*=\s*\{[\s\S]*?\n\};/)}
  ${grab("FMT", /const FMT\s*=\s*\{[\s\S]*?\n\};/)}
  return { ITEMS, COND_DOT, CAT_ICONS, FMT };
})()`);

// ── Helpers ──
const esc = s =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const isAbs = u => /^https?:\/\//i.test(String(u));
const relPath = u => String(u).replace(/^\.?\//, "");
// Para los meta tags: URL absoluta y pública.
const absUrl = u => (isAbs(u) ? String(u) : `${SITE}/${relPath(u)}`);
// Para los <img> de la página, que vive un nivel más abajo (item/<id>.html).
// Relativa, así también funciona en juanmav.github.io/comeback/.
const pageUrl = u => (isAbs(u) ? String(u) : `../${relPath(u)}`);

const imagesOf = item =>
  Array.isArray(item.imagen) ? item.imagen.filter(Boolean) : item.imagen ? [item.imagen] : [];

const catLabel = c => (CAT_ICONS[c] ? `${CAT_ICONS[c]} ${c}` : c);

function priceEntries(precio) {
  if (!precio) return [];
  return Object.entries(precio).filter(([k, v]) => v != null && k !== "eur");
}

function priceText(precio) {
  const tags = priceEntries(precio).map(([k, v]) => FMT[k](v));
  return tags.length ? tags.join(" · ") : "Precio a consultar";
}

function metaDescription(item) {
  const parts = [item.descripcion, priceText(item.precio), item.condicion].filter(Boolean);
  const txt = parts.join(" · ").replace(/\s+/g, " ").trim();
  return txt.length > 300 ? `${txt.slice(0, 297).trimEnd()}…` : txt;
}

function linkLabel(item) {
  if (!item.url) return null;
  if (item.url.includes("mercadolibre")) {
    return item.mlUsado ? "Ver publicación en MercadoLibre" : "Ver precio de nuevo en MercadoLibre";
  }
  return "Ver ficha técnica oficial";
}

function waHref(item) {
  const txt = encodeURIComponent(
    `Hola! Me interesa "${item.nombre}" que vi en su lista. ¿Está disponible?`
  );
  return `https://wa.me/${WA}?text=${txt}`;
}

function jsonLd(item, url, imgs) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": url,
    name: item.nombre,
    url,
  };
  if (item.descripcion) data.description = item.descripcion;
  if (imgs.length) data.image = imgs.map(absUrl);
  if (item.categoria) data.category = item.categoria;
  if (CONDITION_SCHEMA[item.condicion]) data.itemCondition = CONDITION_SCHEMA[item.condicion];

  const [moneda, monto] = priceEntries(item.precio)[0] || [];
  if (monto != null) {
    data.offers = {
      "@type": "Offer",
      url,
      price: monto,
      priceCurrency: moneda.toUpperCase(),
      itemCondition: data.itemCondition,
      availability: item.vendido
        ? "https://schema.org/SoldOut"
        : item.reservado
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
      seller: { "@type": "Organization", name: "adios.com.ar" },
    };
    if (!data.itemCondition) delete data.offers.itemCondition;
  }
  return JSON.stringify(data, null, 2);
}

// ── Plantilla de la página de ítem ──
const STYLE = `
  :root {
    --accent: #e63946; --dark: #1d3557; --mid: #457b9d;
    --light-bg: #f8f9fa; --card-bg: #fff; --text: #212529;
    --muted: #6c757d; --border: #e9ecef; --whatsapp: #25d366; --radius: 12px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', system-ui, sans-serif;
    background: var(--light-bg); color: var(--text);
    line-height: 1.55; min-height: 100vh;
  }
  .topbar {
    background: linear-gradient(135deg, var(--dark) 0%, var(--mid) 100%);
    padding: 14px 20px;
  }
  .topbar a {
    color: #fff; text-decoration: none; font-size: 14px; font-weight: 500;
    display: inline-flex; align-items: center; gap: 7px; opacity: 0.92;
  }
  .topbar a:hover { opacity: 1; }
  main { max-width: 900px; margin: 0 auto; padding: 26px 20px 60px; }
  .sheet {
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden;
  }
  .gallery { background: #fff; border-bottom: 1px solid var(--border); }
  .gallery-main {
    display: flex; align-items: center; justify-content: center;
    height: 380px; padding: 18px;
  }
  .gallery-main img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .gallery-main .ph { font-size: 64px; }
  .thumbs { display: flex; gap: 8px; padding: 0 18px 16px; flex-wrap: wrap; }
  .thumbs img {
    width: 62px; height: 62px; object-fit: cover; cursor: pointer;
    border: 2px solid var(--border); border-radius: 8px; background: #fff;
  }
  .thumbs img.active { border-color: var(--mid); }
  .body { padding: 22px 24px 26px; }
  .cat { font-size: 12px; color: var(--mid); font-weight: 600;
         text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 8px; }
  h1 { font-size: 26px; line-height: 1.25; margin-bottom: 12px; }
  .chips { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 14px; }
  .chip {
    font-size: 12px; padding: 4px 11px; border-radius: 999px;
    background: var(--light-bg); border: 1px solid var(--border); color: var(--muted);
  }
  .chip.sinuso { background: #e6f7ec; border-color: #bfe6cd; color: #1e7c3a; }
  .chip.encaja { background: #fff6e0; border-color: #f0dfae; color: #8a6100; }
  .status {
    display: inline-block; font-size: 13px; font-weight: 700;
    letter-spacing: 1.2px; padding: 6px 16px; border-radius: 999px;
    margin-bottom: 12px; text-transform: uppercase;
  }
  .status.reservado { background: #fff3cd; color: #8a6100; border: 1px solid #f0dfae; }
  .status.vendido { background: #f8d7da; color: #842029; border: 1px solid #f5c2c7; }
  .estado-nota { font-size: 14px; color: var(--muted); font-style: italic; }
  .desc { color: var(--muted); font-size: 15px; margin-bottom: 16px; }
  .ext {
    display: inline-block; font-size: 13px; color: var(--mid);
    text-decoration: none; border-bottom: 1px dashed var(--mid); margin-bottom: 18px;
  }
  .prices { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; margin-bottom: 20px; }
  .price { font-size: 15px; color: var(--muted); }
  .price.main { font-size: 27px; font-weight: 700; color: var(--text); }
  .price.consultar { font-size: 19px; font-weight: 600; color: var(--muted); }
  .wa {
    display: inline-flex; align-items: center; gap: 9px;
    background: var(--whatsapp); color: #fff; text-decoration: none;
    padding: 12px 24px; border-radius: 999px; font-size: 15px; font-weight: 600;
  }
  .wa:hover { opacity: 0.92; }
  .foot { margin-top: 20px; font-size: 13px; color: var(--muted); }
  .foot a { color: var(--mid); }
  @media (max-width: 600px) {
    .gallery-main { height: 280px; }
    h1 { font-size: 22px; }
    .body { padding: 18px 18px 22px; }
  }`;

function itemPage(item) {
  const imgs = imagesOf(item);
  const url = `${SITE}/item/${item.id}.html`;
  const ogImage = imgs.length ? absUrl(imgs[0]) : `${SITE}/images/og-cover.jpg`;
  const estado = item.vendido ? "VENDIDO" : item.reservado ? "RESERVADO" : null;
  const title = `${estado ? `[${estado}] ` : ""}${item.nombre} — ${priceText(item.precio)}`;
  const desc = metaDescription(item);
  const label = linkLabel(item);

  const prices = priceEntries(item.precio);
  const pricesHtml = prices.length
    ? prices
        .map(([k, v], i) => `<span class="price${i === 0 ? " main" : ""}">${esc(FMT[k](v))}</span>`)
        .join("")
    : `<span class="price consultar">Precio a consultar</span>`;

  const chips = [
    item.condicion
      ? `<span class="chip">${esc(`${COND_DOT[item.condicion] || ""} ${item.condicion}`.trim())}</span>`
      : "",
    item.sinUso ? `<span class="chip sinuso">✨ Sin uso</span>` : "",
    item.enCaja ? `<span class="chip encaja">📦 En caja</span>` : "",
    item.entregaTardia
      ? `<span class="chip">📦 Entrega tardía · aprox. 7 al 21 de septiembre</span>`
      : "",
  ].filter(Boolean).join("");

  const mainImg = imgs.length
    ? `<img id="main-img" src="${esc(pageUrl(imgs[0]))}" alt="${esc(item.nombre)}">`
    : `<span class="ph">📦</span>`;

  const thumbs = imgs.length > 1
    ? `<div class="thumbs">${imgs
        .map(
          (src, i) =>
            `<img src="${esc(pageUrl(src))}" alt="${esc(item.nombre)} — foto ${i + 1}"${
              i === 0 ? ' class="active"' : ""
            } onclick="swap(this)">`
        )
        .join("")}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${esc(url)}">
  ${estado ? `<meta name="robots" content="noindex">` : ""}
  <meta name="theme-color" content="#1d3557">
  <link rel="icon" href="${FAVICON}">

  <!-- Open Graph (WhatsApp, Facebook, LinkedIn, Telegram) -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="adios.com.ar">
  <meta property="og:locale" content="es_AR">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta property="og:image:secure_url" content="${esc(ogImage)}">
  <meta property="og:image:alt" content="${esc(item.nombre)}">

  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${esc(ogImage)}">
  <meta name="twitter:image:alt" content="${esc(item.nombre)}">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${STYLE}</style>
  <script type="application/ld+json">
${jsonLd(item, url, imgs)}
  </script>
</head>
<body>

<div class="topbar">
  <a href="../">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
    Ver todo el catálogo
  </a>
</div>

<main>
  <article class="sheet">
    <div class="gallery">
      <div class="gallery-main">${mainImg}</div>
      ${thumbs}
    </div>
    <div class="body">
      ${item.categoria ? `<div class="cat">${esc(catLabel(item.categoria))}</div>` : ""}
      ${estado ? `<div class="status ${estado.toLowerCase()}">${estado}</div>` : ""}
      <h1>${esc(item.nombre)}</h1>
      ${chips ? `<div class="chips">${chips}</div>` : ""}
      ${item.descripcion ? `<p class="desc">${esc(item.descripcion)}</p>` : ""}
      ${item.url ? `<a class="ext" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>` : ""}
      <div class="prices">${pricesHtml}</div>
      ${estado ? `<p class="estado-nota">${
        estado === "VENDIDO"
          ? "Este artículo ya fue vendido."
          : "Este artículo está reservado."
      }</p>` : `<a class="wa" href="${esc(waHref(item))}" target="_blank" rel="noopener">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        Consultar por WhatsApp
      </a>`}
      <p class="foot">Los precios son flexibles, ¡animate a consultar! · <a href="../">Ver los demás artículos</a></p>
    </div>
  </article>
</main>

${imgs.length > 1 ? `<script>
function swap(el) {
  document.getElementById('main-img').src = el.src;
  document.querySelectorAll('.thumbs img').forEach(t => t.classList.toggle('active', t === el));
}
</script>` : ""}
</body>
</html>
`;
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Página no encontrada — adios.com.ar</title>
  <meta name="robots" content="noindex">
  <link rel="icon" href="${FAVICON}">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, sans-serif; min-height: 100vh;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; padding: 32px;
      background: linear-gradient(135deg, #1d3557 0%, #457b9d 100%); color: #fff;
    }
    h1 { font-size: 30px; margin-bottom: 14px; }
    p { font-size: 17px; opacity: 0.88; max-width: 440px; line-height: 1.6; margin-bottom: 26px; }
    a {
      background: #fff; color: #1d3557; text-decoration: none; font-weight: 600;
      padding: 12px 26px; border-radius: 999px; font-size: 15px;
    }
  </style>
</head>
<body>
  <h1>No encontramos esa página</h1>
  <p>Puede que el artículo ya esté reservado o vendido, o que el link esté incompleto.</p>
  <a href="/">Ver el catálogo completo</a>
</body>
</html>
`;
}

function sitemap(items) {
  const hoy = new Date().toISOString().slice(0, 10);
  const urls = [`${SITE}/`, ...items.map(i => `${SITE}/item/${i.id}.html`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(u => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${hoy}</lastmod>\n  </url>`)
  .join("\n")}
</urlset>
`;
}

// ── Build ──
const disponibles = ITEMS.filter(i => !i.vendido && !i.reservado);
const noDisponibles = ITEMS.length - disponibles.length;

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const ids = new Set();
for (const item of ITEMS) {
  if (ids.has(item.id)) throw new Error(`id duplicado en ITEMS: ${item.id}`);
  ids.add(item.id);
  fs.writeFileSync(path.join(OUT_DIR, `${item.id}.html`), itemPage(item));
}

fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap(disponibles));
fs.writeFileSync(
  path.join(ROOT, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`
);
fs.writeFileSync(path.join(ROOT, "404.html"), notFoundPage());

const sinImagen = disponibles.filter(i => imagesOf(i).length === 0);
console.log(`✓ ${ITEMS.length} páginas en item/ (${noDisponibles} reservados/vendidos con banner de estado, noindex y fuera del sitemap)`);
console.log(`✓ sitemap.xml, robots.txt y 404.html actualizados`);
if (sinImagen.length) {
  console.log(
    `⚠ ${sinImagen.length} ítem(s) sin imagen — su preview usa images/og-cover.jpg: ` +
      sinImagen.map(i => `#${i.id}`).join(", ")
  );
}
