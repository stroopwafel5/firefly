/**
 * What an event page says, from its HTML: title, description, structured event data
 * (schema.org JSON-LD, which ticket sites often include), candidate photos and the visible
 * text. Pure: unit-tested; the fetch itself is in process.ts.
 */

export interface PageImage {
  url: string;
  alt: string;
  from: 'og' | 'jsonld' | 'img';
}

export interface PageInfo {
  title: string;
  description: string;
  siteName: string;
  images: PageImage[];
  /** schema.org Event objects found on the page (compact JSON). */
  events: string[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', laquo: '«', raquo: '»', shy: '' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return out;
}

function absolute(url: string, base: string): string | null {
  try {
    const u = new URL(url.trim(), base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Icons, tracking pixels, logos and badges are not event photos. */
const NOT_A_PHOTO = /\.svg(\?|$)|facebook\.com\/tr|pixel|spacer|blank\.gif|sprite|favicon|\/icons?\/|badge|app-?store|google-?play|logo|avatar|emoji|placeholder|loader/i;

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      /* broken JSON-LD: skip */
    }
  }
  return out;
}

function flattenLd(v: unknown, acc: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (Array.isArray(v)) v.forEach((x) => flattenLd(x, acc));
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    acc.push(o);
    if (o['@graph']) flattenLd(o['@graph'], acc);
  }
  return acc;
}

const isEventType = (t: unknown) => (Array.isArray(t) ? t : [t]).some((x) => typeof x === 'string' && /Event$/.test(x));

export function readPage(html: string, baseUrl: string): PageInfo {
  const head = html.slice(0, 200_000);
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const k = (a.property ?? a.name ?? a.itemprop ?? '').toLowerCase();
    if (k && a.content && !meta[k]) meta[k] = a.content.trim();
  }
  const titleTag = decodeEntities(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();

  const images: PageImage[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined, alt: string, from: PageImage['from']) => {
    if (!raw) return;
    const url = absolute(raw, baseUrl);
    if (!url || seen.has(url) || NOT_A_PHOTO.test(url)) return;
    seen.add(url);
    images.push({ url, alt: alt.slice(0, 120), from });
  };
  add(meta['og:image'] || meta['og:image:url'] || meta['og:image:secure_url'], meta['og:image:alt'] ?? '', 'og');
  add(meta['twitter:image'], meta['twitter:image:alt'] ?? '', 'og');

  const ld = flattenLd(jsonLdBlocks(html));
  const events = ld.filter((o) => isEventType(o['@type']));
  for (const e of events) {
    const img = e.image;
    for (const i of Array.isArray(img) ? img : [img]) {
      add(typeof i === 'string' ? i : (i as { url?: string } | undefined)?.url, String(e.name ?? ''), 'jsonld');
    }
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (images.length >= 14) break;
    const a = attrs(m[0]);
    const w = Number(a.width);
    const h = Number(a.height);
    if ((w && w < 150) || (h && h < 100)) continue;
    const src = a['data-src'] || a['data-lazy-src'] || a['data-original'] || a.src || (a.srcset ?? a['data-srcset'] ?? '').split(',').pop()?.trim().split(/\s+/)[0];
    if (!src || src.startsWith('data:')) continue;
    add(src, a.alt ?? a.title ?? '', 'img');
  }

  const body = html
    .replace(/<head[\s\S]*?<\/head>/i, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/header|\/footer|\/td|\/dd|\/dt)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const lines: string[] = [];
  const seenLine = new Set<string>();
  for (const raw of decodeEntities(body).split('\n')) {
    const l = raw.replace(/\s+/g, ' ').trim();
    if (!l || seenLine.has(l)) continue;
    seenLine.add(l);
    lines.push(l);
  }

  return {
    title: (meta['og:title'] || titleTag).slice(0, 300),
    description: (meta['og:description'] || meta.description || '').slice(0, 1000),
    siteName: (meta['og:site_name'] || '').slice(0, 100),
    images: images.slice(0, 12),
    events: events.slice(0, 5).map((e) => {
      const { image: _i, '@context': _c, ...rest } = e;
      return JSON.stringify(rest).slice(0, 3000);
    }),
    text: lines.join('\n').slice(0, 14_000),
  };
}

/** Readable host name for "source" lines: "ru.kupatbravo.co.il" → "kupatbravo.co.il". */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^(www|ru|he|en|m)\./, '');
  } catch {
    return '';
  }
}
