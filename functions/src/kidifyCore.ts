/**
 * The kids' rewording request (Anthropic Messages API), pure so scripts/checkApis.ts can run the
 * exact same prompt. The model may only reuse facts in the given (Wikipedia) text.
 */
export type KidLang = 'en' | 'he' | 'ru';
const LANG_NAME: Record<KidLang, string> = { en: 'English', he: 'Hebrew', ru: 'Russian' };

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export function kidifyRequest(text: string, lang: KidLang, title: string, model: string) {
  return {
    model,
    max_tokens: 300,
    system:
      `You rewrite short encyclopedia texts for children aged 7–10, in ${LANG_NAME[lang]}. ` +
      'Write 2–3 short, friendly sentences. Use ONLY facts stated in the given text — never add facts, numbers or names that are not in it. ' +
      'Reply with the rewritten text only.',
    messages: [{ role: 'user', content: `Place: ${title}\n\nText:\n${text}` }],
  };
}

export function anthropicHeaders(key: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
}

export function kidifyText(j: { content?: Array<{ type: string; text?: string }> }): string | null {
  return j.content?.find((c) => c.type === 'text')?.text?.trim() || null;
}

/** Numbers in the rewrite must all appear in the source text (a cheap "no new facts" check). */
export function numbersNotInSource(source: string, rewrite: string): string[] {
  const nums = (s: string) => new Set((s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.')));
  const src = nums(source);
  return [...nums(rewrite)].filter((n) => !src.has(n));
}
