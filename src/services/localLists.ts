import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserDoc } from '../models';
import type { ListField } from './userService';

/**
 * Favourites saved on the phone first. A heart turns on at once and is kept here until the server
 * has it on the profile; if saving to the server fails (no connection, rules not deployed…), it
 * stays on the phone, still shows on the profile, and is sent again later. So a favourite is
 * never lost to a failed request.
 */

export interface PendingOp {
  field: ListField;
  id: string | number;
  on: boolean;
  at: number;
}

const key = (uid: string) => `firefly.pendingLists.v1.${uid}`;
const opKey = (field: ListField, id: string | number) => `${field}:${typeof id}:${id}`;

let owner = '';
let ops = new Map<string, PendingOp>();
const listeners = new Set<() => void>();
let version = 0;

const changed = () => {
  version++;
  listeners.forEach((l) => l());
};

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const snapshotVersion = () => version;

/** Loads this user's pending favourites (once per sign-in). */
export async function loadPending(uid: string): Promise<void> {
  if (owner === uid) return;
  owner = uid;
  ops = new Map();
  try {
    const list = JSON.parse((await AsyncStorage.getItem(key(uid))) ?? '[]') as PendingOp[];
    for (const o of list) ops.set(opKey(o.field, o.id), o);
  } catch {
    /* nothing saved */
  }
  changed();
}

async function persist() {
  if (!owner) return;
  await AsyncStorage.setItem(key(owner), JSON.stringify([...ops.values()])).catch(() => undefined);
}

export function setPending(uid: string, field: ListField, id: string | number, on: boolean) {
  if (owner !== uid) {
    owner = uid;
    ops = new Map();
  }
  ops.set(opKey(field, id), { field, id, on, at: Date.now() });
  changed();
  void persist();
}

export function clearPending(field: ListField, id: string | number) {
  if (ops.delete(opKey(field, id))) {
    changed();
    void persist();
  }
}

export const pendingOps = (): PendingOp[] => [...ops.values()];

/** A profile list with the phone's pending changes applied. */
export function effectiveList<T extends string | number>(profile: Pick<UserDoc, ListField> | null, field: ListField): T[] {
  const base = ((profile?.[field] as T[] | undefined) ?? []).slice();
  for (const o of ops.values()) {
    if (o.field !== field) continue;
    const i = base.indexOf(o.id as T);
    if (o.on && i < 0) base.push(o.id as T);
    if (!o.on && i >= 0) base.splice(i, 1);
  }
  return base;
}

/** Drops pending changes the server profile already shows. */
export function settle(profile: Pick<UserDoc, ListField>) {
  let dropped = false;
  for (const [k, o] of ops) {
    const has = ((profile[o.field] as Array<string | number> | undefined) ?? []).includes(o.id);
    if (has === o.on) {
      ops.delete(k);
      dropped = true;
    }
  }
  if (dropped) {
    changed();
    void persist();
  }
}
