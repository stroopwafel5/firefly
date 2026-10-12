import { ANTHROPIC_URL, anthropicHeaders } from '../../kidifyCore';
import type { ProcessDeps } from './process';

/**
 * The outside services the event pipeline uses (the upload page and the weekly event search):
 * reading an event page, Wikipedia's photo of a venue, and Claude's Messages API.
 */

const UA = 'Mozilla/5.0 (compatible; FireflyEvents/1.0; +https://www.differentroute.net)';

export async function fetchPage(url: string) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'he,ru;q=0.9,en;q=0.8' },
    signal: AbortSignal.timeout(20_000),
  });
  const buf = await res.arrayBuffer();
  return {
    html: new TextDecoder('utf-8').decode(buf.byteLength > 3_000_000 ? buf.slice(0, 3_000_000) : buf),
    finalUrl: res.url || url,
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
  };
}

export async function wikiPhoto(title: string) {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { title?: string; originalimage?: { source?: string }; thumbnail?: { source?: string }; content_urls?: { desktop?: { page?: string } } };
  const url = j.originalimage?.source ?? j.thumbnail?.source;
  // Photos only (Wikipedia's lead images of places are JPEGs; maps, flags and logos are SVG/PNG).
  if (!url || !/\.jpe?g($|\?)/i.test(url) || !j.content_urls?.desktop?.page) return null;
  return { url, page: j.content_urls.desktop.page, title: j.title ?? title };
}

/** The Messages API; falls back to the kids' model if the configured one isn't available on the account. */
export function claude(key: string) {
  return async (body: Parameters<ProcessDeps['ai']>[0]) => {
    const send = async (model: string) => {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: anthropicHeaders(key),
        body: JSON.stringify({ ...body, model }),
        signal: AbortSignal.timeout(120_000),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: res.ok, status: res.status, j };
    };
    let model = body.model;
    let r = await send(model);
    for (let attempt = 1; attempt <= 3 && (r.status === 429 || r.status === 529 || r.status >= 500); attempt++) {
      // Busy or rate-limited: wait a little and try again.
      await new Promise((ok) => setTimeout(ok, 8_000 * attempt));
      r = await send(model);
    }
    if (!r.ok && (r.status === 404 || /model/i.test(r.j.error?.message ?? '')) && model !== 'claude-haiku-5-5') {
      model = 'claude-haiku-5-5';
      r = await send(model);
    }
    if (!r.ok) throw new Error(`Claude API ${r.status}: ${r.j.error?.message ?? 'error'}`);
    return r.j as Awaited<ReturnType<ProcessDeps['ai']>>;
  };
}


/** The Messages API for any request (the weekly search uses web search); same retries as above. */
export async function claudeRaw(key: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ANTHROPIC_URL, { method: 'POST', headers: anthropicHeaders(key), body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    if (res.ok) return j;
    if (attempt < 3 && (res.status === 429 || res.status === 529 || res.status >= 500)) {
      await new Promise((ok) => setTimeout(ok, 8_000 * (attempt + 1)));
      continue;
    }
    throw new Error(`Claude API ${res.status}: ${j.error?.message ?? 'error'}`);
  }
}
