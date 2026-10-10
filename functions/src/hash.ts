import { createHash } from 'node:crypto';

/** sha1 hex (no Firebase imports, so pure modules and scripts can use it). */
export const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
