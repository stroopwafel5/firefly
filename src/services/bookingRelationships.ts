/** Relationship options of the JotForm emergency-contact field (kept dependency-free for tests). */
export const RELATIONSHIPS = [
  'Mother',
  'Father',
  'Grandparent',
  'Aunt',
  'Uncle',
  'Sibling',
  'Babysitter/Nanny',
  'Other',
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];
