import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { ListField, errorCode, toggleInList } from '../services/userService';
import { clearPending, effectiveList, loadPending, pendingOps, setPending, settle, snapshotVersion, subscribe } from '../services/localLists';
import { toast } from '../components/ui';

/** One "saved on this phone" message per app run, not one per heart. */
let warnedOffline = false;
let retrying = false;

/**
 * Favourites / booked lists on the signed-in user's profile. Guests (anonymous sessions) are
 * sent to the sign-in screen first. A change shows at once and is kept on the phone until the
 * server has it (services/localLists.ts), so a failed request never loses a favourite.
 */
export function useLists() {
  const { profile, profileConfirmed, firebaseUser } = useAuth();
  const { t } = useI18n();
  const nav = useNavigation<{ navigate: (screen: string, params?: object) => void }>();
  const signedIn = !!firebaseUser && !firebaseUser.isAnonymous && !!profile;
  useSyncExternalStore(subscribe, snapshotVersion);
  const uid = profile?.uid ?? '';
  const tRef = useRef(t);
  tRef.current = t;

  // Load this user's pending changes, drop the ones the server already has, send the rest again.
  useEffect(() => {
    if (!uid || !profile) return;
    void loadPending(uid).then(async () => {
      // Only the server's own copy says a change arrived (the phone shows its own changes at once).
      if (profileConfirmed) settle(profile);
      if (retrying) return;
      retrying = true;
      try {
        for (const o of pendingOps()) {
          try {
            await toggleInList(uid, o.field, o.id, o.on);
            clearPending(o.field, o.id);
          } catch {
            break; // still failing: try again later
          }
        }
      } finally {
        retrying = false;
      }
    });
  }, [uid, profile, profileConfirmed]);

  const list = useCallback(<T extends string | number>(field: ListField): T[] => effectiveList<T>(profile, field), [profile]);
  const has = useCallback((field: ListField, id: string | number) => !!profile && list(field).includes(id), [profile, list]);

  const toggle = useCallback(
    async (field: ListField, id: string | number): Promise<boolean | null> => {
      if (!signedIn || !profile) {
        toast(tRef.current('common.signInRequired'));
        nav.navigate('SignIn');
        return null;
      }
      const on = !has(field, id);
      setPending(profile.uid, field, id, on);
      try {
        await toggleInList(profile.uid, field, id, on);
        clearPending(field, id);
      } catch (e) {
        if (!warnedOffline) {
          warnedOffline = true;
          toast(tRef.current('common.savedOnPhone', { code: errorCode(e) }));
        }
      }
      return on;
    },
    [signedIn, profile, has, nav],
  );

  return { has, list, toggle, signedIn, profile };
}
