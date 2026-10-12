/**
 * Firestore can't store two things a trip has: arrays inside arrays (a place's opening hours are
 * one list per weekday, each a list of spans) and `undefined` values. Saving a trip with either
 * failed with "Something went wrong". These turn such values into a form Firestore keeps and back:
 * an array inside an array is stored as `{ _arr: [...] }`, and undefined fields are left out.
 * Pure, unit-tested.
 */

const WRAP = '_arr';

function encode(v: unknown, insideArray: boolean): unknown {
  if (v === undefined) return undefined;
  if (Array.isArray(v)) {
    const list = v.map((x) => {
      const e = encode(x, true);
      return e === undefined ? null : e;
    });
    return insideArray ? { [WRAP]: list } : list;
  }
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const e = encode(x, false);
      if (e !== undefined) out[k] = e;
    }
    return out;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v;
}

/** A value Firestore accepts (plain JSON data: objects, arrays, strings, numbers, booleans, null). */
export function toFirestore<T>(v: T): T {
  return encode(v, false) as T;
}

/** Back from the stored form (arrays inside arrays restored). */
export function fromFirestore<T>(v: T): T {
  const decode = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(decode);
    if (x && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype) {
      const o = x as Record<string, unknown>;
      const keys = Object.keys(o);
      if (keys.length === 1 && keys[0] === WRAP && Array.isArray(o[WRAP])) return (o[WRAP] as unknown[]).map(decode);
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = decode(o[k]);
      return out;
    }
    return x;
  };
  return decode(v) as T;
}

/**
 * The same data, small enough for one Firestore document (Firestore keeps up to 1 MiB): when it is over ~900 KB, long texts
 * (descriptions) are shortened, step by step, until it fits. Nothing else changes.
 */
export function fitDocument<T>(v: T, limit = 900_000): T {
  const size = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;
  let out = v;
  for (const max of [2000, 800, 300]) {
    if (size(out) <= limit) return out;
    const cut = (x: unknown): unknown => {
      if (typeof x === 'string') return x.length > max && !/^https?:\/\//.test(x) ? `${x.slice(0, max - 1)}…` : x;
      if (Array.isArray(x)) return x.map(cut);
      if (x && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype) {
        return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, y]) => [k, cut(y)]));
      }
      return x;
    };
    out = cut(out) as T;
  }
  return out;
}
