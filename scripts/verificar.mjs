#!/usr/bin/env node
/**
 * Verificación completa de settleworth.online antes de dar nada por bueno.
 *
 *   python3 -m http.server 8899       (desde la raíz del repo)
 *   node scripts/verificar.mjs
 *
 * Sale con código 1 si algo falla. No se despliega en rojo.
 * Cada comprobación existe porque algo se rompió, o porque un especialista
 * afirmó haberlo arreglado y hay que poder demostrarlo sin creerle.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const HOST = 'http://localhost:8899';
const R = { ok: [], fail: [] };
const ok = (m) => R.ok.push(m);
const fail = (m) => R.fail.push(m);

const DOMINIO = 'https://www.settleworth.online';
const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
const LIVE = [...sitemap.matchAll(/<loc>https:\/\/www\.settleworth\.online\/([^<]*)<\/loc>/g)].map(m => '/' + m[1]);
const FILE = (u) => (u === '/' ? 'index.html' : u.replace(/^\/|\/$/g, '') + '.html');
const PAGES = LIVE.map(FILE);
const REDIR = new Map((JSON.parse(fs.readFileSync('vercel.json', 'utf8')).redirects || []).map(r => [r.source.replace(/\/$/, ''), r.destination]));
// Las 11 páginas que llevan calculadora
const CALC = PAGES.filter(f => fs.readFileSync(f, 'utf8').includes('data-calculator'));

// ── 1. host canónico: todo en www, nada en el ápice ─────────────────────────
// El ápice responde 308. Cuando las canonicals apuntaban ahí, el sitemap
// entregaba cero URLs válidas y cada página se auto-canonicalizaba a un redirect.
{
  let malas = [];
  for (const f of PAGES) {
    const h = fs.readFileSync(f, 'utf8');
    for (const m of h.matchAll(/https:\/\/settleworth\.online/g)) malas.push(f);
  }
  const sm = /https:\/\/settleworth\.online[^w]/.test(sitemap);
  malas.length || sm ? fail(`host sin www en ${[...new Set(malas)].join(', ')}${sm ? ' y en sitemap.xml' : ''}`)
                     : ok('canonical, og:url y JSON-LD apuntan todos a www');
}

// ── 2. .htaccess no se despliega ────────────────────────────────────────────
// Estaba servido públicamente con 200, muerto en Vercel, y declaraba
// canonicalización contraria a la real.
fs.existsSync('.htaccess') ? fail('.htaccess presente: Vercel no lo usa y se sirve público')
                           : ok('.htaccess no está en el repo');

// ── 3. sitemap coherente con los ficheros ───────────────────────────────────
{
  const faltan = LIVE.filter(u => !fs.existsSync(FILE(u)));
  const sinLastmod = (sitemap.match(/<url>/g) || []).length !== (sitemap.match(/<lastmod>/g) || []).length;
  faltan.length ? fail(`sitemap apunta a ficheros que no existen: ${faltan.join(', ')}`)
                : ok(`sitemap: ${LIVE.length} URLs, todas con fichero`);
  sinLastmod ? fail('hay URLs del sitemap sin lastmod') : ok('todas las URLs del sitemap llevan lastmod');
}

// ── 4. la herramienta existe en el HTML crudo ───────────────────────────────
// Googlebot indexa la primera ola sin JS. Si la calculadora se inyecta entera
// por JS, el rastreador ve prosa sobre calculadoras, no una calculadora. Es el
// mismo fallo que en el otro nicho costó el 97 % de las impresiones.
{
  let sinTool = [];
  for (const f of CALC) {
    const h = fs.readFileSync(f, 'utf8');
    const dentro = (h.match(/<div[^>]*data-calculator[^>]*>([\s\S]*?)<\/section>/) || [, ''])[1];
    const campos = (dentro.match(/<(input|select)\b/g) || []).length;
    if (campos === 0) sinTool.push(path.basename(f, '.html'));
  }
  sinTool.length ? fail(`${sinTool.length} páginas sirven la calculadora solo por JS (0 campos en el HTML): ${sinTool.slice(0, 4).join(', ')}…`)
                 : ok(`${CALC.length} calculadoras pre-renderizadas: el rastreador ve campos reales`);
}

// ── 5. noscript en todas las páginas con herramienta ────────────────────────
{
  const sin = CALC.filter(f => !fs.readFileSync(f, 'utf8').includes('<noscript'));
  sin.length ? fail(`sin <noscript>: ${sin.join(', ')}`) : ok(`<noscript> en las ${CALC.length} páginas con calculadora`);
}

// ── navegador ───────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route('**/*', r => (r.request().url().startsWith(HOST) ? r.continue() : r.abort()));

// ── 6. las 4 ramas del motor devuelven cifra y sin errores ──────────────────
{
  const CASOS = [
    ['car-accident-settlement-calculator.html', 'injury'],
    ['workers-comp-settlement-calculator.html', 'workers comp'],
    ['diminished-value-claim-calculator.html', 'diminished value'],
    ['wrongful-termination-settlement-calculator.html', 'wrongful termination'],
  ];
  let mal = 0;
  for (const [f, modo] of CASOS) {
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(String(e).slice(0, 90)));
    pg.on('console', m => m.type() === 'error' && errs.push(m.text().slice(0, 90)));
    await pg.goto(`${HOST}/${f}`, { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(400);
    for (let paso = 0; paso < 7; paso++) {
      if (await pg.$('.result')) break;
      await pg.evaluate(() => {
        document.querySelectorAll('[data-calculator] input').forEach(i => {
          if (i.offsetParent === null) return;
          if (i.type === 'range') { i.value = i.min || '0'; }
          else if (!i.value) {
            // valores realistas: el motor rechaza cifras absurdas, y con razón
            const id = i.id || '';
            i.value = /wks|weeks/.test(id) ? '20' : /fpw/.test(id) ? '12'
                    : /interim/.test(id) ? '0' : /ben/.test(id) ? '400'
                    : /mileage|miles/.test(id) ? '30000' : /sal/.test(id) ? '65000' : '15000';
          }
          i.dispatchEvent(new Event('input', { bubbles: true }));
          i.dispatchEvent(new Event('change', { bubbles: true }));
        });
        document.querySelectorAll('[data-calculator] select').forEach(s => {
          if (s.offsetParent === null || s.value) return;
          if (s.options.length > 1) { s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); }
        });
      });
      // los toggles segmentados son <button data-v>, no input: hay que pulsarlos
      await pg.evaluate(() => {
        document.querySelectorAll('[data-calculator] .seg-toggle').forEach(g => {
          if (!g.querySelector('button[aria-pressed="true"], button.on')) g.querySelector('button')?.click();
        });
      });
      const b = await pg.$('[data-calculator] .btn:not(.secondary)');
      if (!b) break;
      await b.click().catch(() => {});
      await pg.waitForTimeout(300);
    }
    const r = await pg.evaluate(() => ({
      cifra: /\$[\d,]{3,}/.test(document.querySelector('.result')?.innerText || ''),
      live: !!document.querySelector('.next-steps.is-live'),
    }));
    if (errs.length || !r.cifra) { fail(`modo ${modo}: ${errs[0] || 'no devuelve cifra'}`); mal++; }
    else if (!r.live) { fail(`modo ${modo}: el bloque next-steps no se marca is-live`); mal++; }
    await pg.close();
  }
  mal === 0 ? ok('las 4 ramas del motor devuelven cifra, sin errores, y activan next-steps') : null;
}

// ── 7. regresiones del mapa de culpa ────────────────────────────────────────
// Cada uno de estos casos estaba mal en producción y da una cifra equivocada
// a alguien que decide si acepta la oferta de su aseguradora.
{
  const pg = await ctx.newPage();
  await pg.goto(`${HOST}/car-accident-settlement-calculator.html`, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(400);
  const fuente = fs.readFileSync('assets/calculator.js', 'utf8');
  const casos = [
    [/south dakota|SDCL/i, 'South Dakota / SDCL § 20-9-2 (régimen slight-gross)'],
    [/55-7-13c|west virginia/i, 'West Virginia (barrera al 51 %)'],
    [/600\.2959|michigan/i, 'Michigan (MCL 600.2959, solo daños no económicos)'],
    [/50-2204\.52|pedestrian/i, 'D.C. peatones y ciclistas'],
  ];
  const faltan = casos.filter(([re]) => !re.test(fuente)).map(([, n]) => n);
  faltan.length ? fail(`el motor no menciona: ${faltan.join(' · ')}`) : ok('el motor cita SD, WV, MI y D.C. con su estatuto');
  // el formulario vacío no puede producir cifra
  const vacio = await pg.evaluate(() => {
    const b = document.querySelector('[data-calculator] .btn:not(.secondary)');
    if (b) b.click();
    // solo el panel de resultado: el cuerpo de la página tiene ejemplos con cifras
    return document.querySelector('.result')?.innerText || '';
  });
  /\$[\d,]{3,}/.test(vacio) ? fail(`el formulario vacío devuelve una cifra: ${vacio.slice(0, 80)}`)
                            : ok('el formulario vacío no produce estimación');
  await pg.close();
}

// ── 8. contraste WCAG AA ────────────────────────────────────────────────────
{
  let n = 0;
  for (const f of PAGES) {
    const pg = await ctx.newPage();
    await pg.goto(`${HOST}/${f}`, { waitUntil: 'load' });
    await pg.waitForTimeout(150);
    n += await pg.evaluate(() => {
      const rgb = s => { const m = s.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
      const lum = a => { const g = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
        return .2126 * g(a[0]) + .7152 * g(a[1]) + .0722 * g(a[2]); };
      const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); };
      const fondos = e => { let x = e, acc = [];
        while (x && x !== document.documentElement) { const s = getComputedStyle(x);
          if (s.backgroundImage && s.backgroundImage !== 'none') {
            for (const m of s.backgroundImage.matchAll(/rgba?\([^)]+\)/g)) { const v = rgb(m[0]); if (v) acc.push(v); }
            if (acc.length) return acc; }
          const bc = s.backgroundColor;
          if (bc && !/rgba\(0, 0, 0, 0\)|transparent/.test(bc)) { const a = (bc.match(/[\d.]+/g) || [])[3], v = rgb(bc);
            if (v && (a === undefined || +a >= .9)) return [v]; if (v) acc.push(v); }
          x = x.parentElement; }
        acc.push([255, 255, 255]); return acc; };
      let c = 0;
      for (const e of document.querySelectorAll('body *')) {
        if (![...e.childNodes].some(x => x.nodeType === 3 && x.textContent.trim())) continue;
        const s = getComputedStyle(e);
        if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) continue;
        const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
        const px = parseFloat(s.fontSize), w = parseInt(s.fontWeight) || 400;
        const min = (px >= 24 || (px >= 18.66 && w >= 700)) ? 3 : 4.5;
        const fg = rgb(s.color); if (!fg) continue;
        if (Math.max(...fondos(e).map(b => ratio(fg, b))) < min) c++;
      }
      return c;
    });
    await pg.close();
  }
  n === 0 ? ok('0 fallos de contraste WCAG AA') : fail(`${n} fallos de contraste WCAG AA`);
}

// ── 9. móvil sin desbordamiento ─────────────────────────────────────────────
for (const [w, h] of [[360, 780], [390, 844]]) {
  const m = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true });
  await m.route('**/*', r => (r.request().url().startsWith(HOST) ? r.continue() : r.abort()));
  const pg = await m.newPage();
  const ovf = [];
  for (const f of PAGES) {
    await pg.goto(`${HOST}/${f}`, { waitUntil: 'load' });
    if (await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) ovf.push(f);
  }
  ovf.length ? fail(`overflow horizontal a ${w}px: ${ovf.join(', ')}`) : ok(`sin overflow horizontal a ${w}px`);
  await m.close();
}

// ── 10. sin peticiones a terceros (fuentes autoalojadas) ────────────────────
{
  const c2 = await browser.newContext();
  const pg = await c2.newPage();
  const fuera = [];
  pg.on('request', r => { if (!r.url().startsWith(HOST)) fuera.push(new URL(r.url()).host); });
  await pg.goto(`${HOST}/car-accident-settlement-calculator.html`, { waitUntil: 'networkidle' });
  const locales = await pg.evaluate(() => performance.getEntriesByType('resource').filter(r => /\/assets\/fonts\//.test(r.name)).length);
  fuera.length ? fail(`peticiones a terceros: ${[...new Set(fuera)].join(', ')}`) : ok('0 peticiones a terceros');
  locales > 0 ? ok(`${locales} fuentes autoalojadas cargadas`) : fail('no se cargan las fuentes locales');
  await c2.close();
}
await browser.close();

// ── 11. grafo de enlaces ────────────────────────────────────────────────────
{
  const g = new Map(); let rotos = [], anclas = [], aRedir = 0, total = 0;
  for (const f of PAGES) {
    const h = fs.readFileSync(f, 'utf8'); const outs = new Set();
    for (const m of h.matchAll(/href="([^"]+)"/g)) {
      const u = m[1]; total++;
      if (u.startsWith('#')) { if (!h.includes(`id="${u.slice(1)}"`)) anclas.push(`${f} -> ${u}`); continue; }
      if (/^https?:|^mailto:|^tel:/.test(u)) continue;
      const c = u.split('#')[0].split('?')[0].replace(/\/$/, '') || '/';
      if (/\.(png|svg|jpe?g|xml|txt|ico|css|js|webmanifest|woff2?)$/.test(c)) {
        if (!fs.existsSync('.' + c)) rotos.push(`${f} -> ${u}`); continue; }
      if (REDIR.has(c)) aRedir++;
      else if (LIVE.map(x => x.replace(/\/$/, '') || '/').includes(c)) outs.add(c);
      else rotos.push(`${f} -> ${u}`);
    }
    g.set('/' + (f === 'index.html' ? '' : f.slice(0, -5)) , outs);
  }
  const norm = u => u.replace(/\/$/, '') || '/';
  const vistas = new Set(['/']), cola = ['/'];
  while (cola.length) { const cur = cola.shift();
    for (const d of (g.get(cur) || g.get(cur + '/') || [])) if (!vistas.has(d)) { vistas.add(d); cola.push(d); } }
  const huerfanas = LIVE.map(norm).filter(u => !vistas.has(u));
  rotos.length ? fail(`${rotos.length} enlaces rotos: ${rotos.slice(0, 4).join(' · ')}`) : ok(`${total} enlaces, 0 rotos`);
  anclas.length ? fail(`${anclas.length} anclas rotas: ${anclas.slice(0, 4).join(' · ')}`) : ok('0 anclas rotas');
  aRedir ? fail(`${aRedir} enlaces apuntan a una URL que redirige`) : ok('0 enlaces a URL redirigida');
  huerfanas.length ? fail(`huérfanas: ${huerfanas.join(', ')}`) : ok(`${vistas.size}/${LIVE.length} alcanzables desde la home`);
}

// ── 12. metadatos ───────────────────────────────────────────────────────────
{
  const EXENTAS = ['/about/', '/privacy/', '/terms/', '/contact/'];
  let malos = [], titles = new Map(), descs = new Map();
  for (const u of LIVE) {
    const h = fs.readFileSync(FILE(u), 'utf8');
    const t = (h.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1];
    const d = (h.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1];
    titles.set(t, [...(titles.get(t) || []), u]);
    descs.set(d, [...(descs.get(d) || []), u]);
    if (t.length < 50 || t.length > 70) malos.push(`${u} title ${t.length}`);
    if (d.length < 130 || d.length > 155) malos.push(`${u} meta ${d.length}`);
    for (const [re, val, lbl] of [[/og:title" content="([^"]*)"/, t, 'og:title'],
                                  [/og:description" content="([^"]*)"/, d, 'og:description']]) {
      const m = h.match(re); if (m && m[1] !== val) malos.push(`${u} ${lbl} desincronizado`);
    }
    const h1 = [...h.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
    if (h1.length !== 1) malos.push(`${u} tiene ${h1.length} H1`);
    else if (h1[0][1].replace(/<[^>]*>/g, '').trim() === t.trim()) malos.push(`${u} H1 = title`);
    if (!/rel="canonical"/.test(h)) malos.push(`${u} sin canonical`);
    if (!/<main id="main"/.test(h)) malos.push(`${u} sin <main id="main">`);
    if (!/class="skip"/.test(h)) malos.push(`${u} sin skip link`);
    const im = h.indexOf('<main id="main"'), ih = h.indexOf('<h1'), ic = h.indexOf('</main>');
    if (!(im < ih && ih < ic)) malos.push(`${u} el H1 queda fuera de <main>`);
    if (!EXENTAS.includes(u) && !/data-page-type="/.test(h)) malos.push(`${u} sin data-page-type`);
  }
  for (const [, v] of titles) if (v.length > 1) malos.push(`title duplicado en ${v.join(', ')}`);
  for (const [, v] of descs) if (v.length > 1) malos.push(`meta duplicada en ${v.join(', ')}`);
  malos.length ? fail(`metadatos:\n   - ${malos.join('\n   - ')}`) : ok(`metadatos correctos en las ${LIVE.length}`);
}

// ── 13. datos estructurados ─────────────────────────────────────────────────
{
  let rotos = 0, ids = new Set(), refs = new Set(), n = 0, rating = [];
  for (const f of PAGES) {
    const h = fs.readFileSync(f, 'utf8');
    if (/aggregateRating/.test(h)) rating.push(f);
    for (const b of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      n++;
      let d; try { d = JSON.parse(b[1]); } catch { rotos++; fail(`JSON-LD roto en ${f}`); continue; }
      for (const nodo of (d['@graph'] || [d])) {
        if (nodo['@id']) ids.add(nodo['@id']);
        for (const v of Object.values(nodo)) if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).join() === '@id') refs.add(v['@id']);
      }
    }
  }
  const sueltas = [...refs].filter(r => !ids.has(r));
  rotos === 0 ? ok(`${n} bloques JSON-LD válidos`) : null;
  sueltas.length ? fail(`referencias @id que no resuelven: ${sueltas.join(', ')}`) : ok('todas las referencias @id resuelven');
  rating.length ? fail(`aggregateRating inventado en ${rating.join(', ')}`) : ok('0 aggregateRating inventados');
}

// ── 14. coherencia entre lo que promete el copy y lo que hace el motor ──────
// Es donde se cuela una mentira cuando han pasado seis manos por el mismo sitio.
{
  const mal = [];
  for (const f of PAGES) {
    const h = fs.readFileSync(f, 'utf8');
    const txt = h.replace(/<[^>]+>/g, ' ');
    // solo cuenta si Florida está en la enumeración que precede al verbo, no en cualquier proximidad
    if (/Florida[^.]{0,80}\bapply pure comparative/i.test(txt)) mal.push(`${f}: Florida sigue citada como pure comparative`);
    // En wrongful termination el motor NO estima distress ni punitivos: solo muestra el
    // techo de 42 U.S.C. 1981a. Se comprueba que la página lo dice, no que no lo diga.
    if (f.includes('wrongful-termination')) {
      if (!/argued rather than computed/i.test(txt))
        mal.push(`${f}: falta el matiz de que distress y punitivos se argumentan, no se calculan`);
      if (!/1981a/.test(txt))
        mal.push(`${f}: no cita 42 U.S.C. 1981a, que es de donde sale el techo que muestra`);
    }
  }
  mal.length ? fail(mal.join('\n   - ')) : ok('el copy no promete nada que el motor no calcule');
}

// ── 15. bloque next-steps en las páginas de dinero ──────────────────────────
{
  const flojas = CALC.filter(f => {
    const h = fs.readFileSync(f, 'utf8');
    const b = (h.match(/<section class="next-steps"[\s\S]*?<\/section>/) || [''])[0];
    return (b.match(/href="\//g) || []).length < 3;
  });
  flojas.length ? fail(`next-steps con menos de 3 salidas: ${flojas.join(', ')}`)
                : ok(`bloque next-steps con 3+ salidas en las ${CALC.length} páginas de dinero`);
}

// ── informe ─────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(70));
for (const m of R.ok) console.log('  ok    ' + m);
for (const m of R.fail) console.log('  FALLA ' + m);
console.log('─'.repeat(70));
console.log(R.fail.length === 0
  ? `\n  ${R.ok.length}/${R.ok.length} comprobaciones pasadas. Listo para desplegar.\n`
  : `\n  ${R.fail.length} comprobaciones fallan. NO desplegar.\n`);
process.exit(R.fail.length ? 1 : 0);
