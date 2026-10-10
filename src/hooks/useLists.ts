import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { ListField, toggleInList } from '../services/userService';
import { toast } from '../components/ui';

/**
 * Favourites / booked lists on the signed-in user's profile. Guests (anonymous sessions) are
 * sent to the sign-in screen first.
 */
export function useLists() {
  const { profile, firebaseUser } = useAuth();
  const { t } = useI18n();
  const nav = useNavigation<{ navigate: (screen: string, params?: object) => void }>();
  const signedIn = !!firebaseUser && !firebaseUser.isAnonymous && !!profile;

  const has = useCallback(
    (field: ListField, id: string | number) => !!profile && (profile[field] as Array<string | number>).includes(id),
    [profile],
  );

  const toggle = useCallback(
    async (field: ListField, id: string | number): Promise<boolean | null> => {
      if (!signedIn || !profile) {
        toast(t('common.signInRequired'));
        nav.navigate('SignIn');
        return null;
      }
      const on = !has(field, id);
      try {
        await toggleInList(profile.uid, field, id, on);
      } catch {
        toast(t('common.error'));
        return null;
      }
      return on;
    },
    [signedIn, profile, has, nav, t],
  );

  return { has, toggle, signedIn, profile };
}
