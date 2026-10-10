import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInputProps, View } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DuskScene, Wordmark, dusk } from '../../components/DuskScene';
import { BackButton, IconName, toast } from '../../components/ui';
import { LANGS, useI18n } from '../../i18n';
import type { TKey } from '../../i18n';
import { colors } from '../../theme';

/** Shared pieces of the log-in and register pages: the dusk scene on top, the form on a light sheet. */

const ink = colors.night; // #1B1B3A
const sheetBg = '#F7F6FB';
const inputBg = '#ECEBF4';
const label = '#4E4A86'; // soft indigo, never grey
const quiet = '#5B57A0';

/** How much of the scene's sky the log-in pages cut off (canvas units, see DuskScene). */
const AUTH_CROP = 24;

export function AuthLayout({ title, onBack, children }: { title: string; onBack?: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { t, lang, setLang } = useI18n();
  return (
    <View style={{ flex: 1, backgroundColor: ink }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
        <DuskScene crop={AUTH_CROP}>
          <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
            {onBack ? <BackButton onPress={onBack} /> : <View />}
            <View style={s.langs}>
              {LANGS.map((l) => (
                <Pressable
                  key={l}
                  accessibilityRole="button"
                  accessibilityState={{ selected: l === lang }}
                  onPress={async () => {
                    if (l === lang) return;
                    if ((l === 'he') !== (lang === 'he')) toast(t('user.rtlRestart'));
                    await setLang(l);
                  }}
                  style={[s.lang, l === lang && s.langOn]}
                >
                  <Text style={[s.langText, l === lang && s.langTextOn]}>{t(`lang.${l}` as TKey)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={s.word}>
            <Wordmark />
          </View>
        </DuskScene>
        <View style={[s.sheet, { paddingBottom: insets.bottom + 28 }]}>
          <Text style={s.title} accessibilityRole="header">
            {title}
          </Text>
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

export function AuthInput({
  label: text,
  icon,
  error,
  hint,
  secure,
  ...props
}: TextInputProps & { label: string; icon: IconName; error?: string; hint?: string; secure?: boolean }) {
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{text}</Text>
      <View style={[s.input, focused && s.inputFocused, !!error && s.inputError]}>
        <MaterialCommunityIcons name={icon} size={20} color={focused ? ink : quiet} />
        <TextInput
          accessibilityLabel={text}
          placeholderTextColor={quiet}
          secureTextEntry={secure && hidden}
          autoCorrect={false}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={s.inputText}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? t('auth.showPassword') : t('auth.hidePassword')}
            onPress={() => setHidden(!hidden)}
            hitSlop={10}
          >
            <MaterialCommunityIcons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={quiet} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function PrimaryButton({ label: text, onPress, loading }: { label: string; onPress: () => void; loading?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: !!loading }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [s.primary, pressed && { opacity: 0.85 }]}
    >
      {loading ? <ActivityIndicator color={ink} /> : <Text style={s.primaryText}>{text}</Text>}
    </Pressable>
  );
}

/** "New to Firefly? Create an account" — the question is quiet, the action is the link. */
export function SwitchLink({ question, action, onPress }: { question: string; action: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={s.switch} hitSlop={8}>
      <Text style={s.switchText}>
        {question} <Text style={s.switchAction}>{action}</Text>
      </Text>
    </Pressable>
  );
}

/** "or" + Continue as guest + what guests can do. */
export function GuestOption({ onPress }: { onPress: () => void }) {
  const { t } = useI18n();
  return (
    <View>
      <View style={s.or}>
        <View style={s.orLine} />
        <Text style={s.orText}>{t('auth.or')}</Text>
        <View style={s.orLine} />
      </View>
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.guest, pressed && { backgroundColor: '#ECEBF4' }]}>
        <Text style={s.guestText}>{t('auth.guest')}</Text>
      </Pressable>
      <Text style={s.note}>{t('auth.guestNote')}</Text>
    </View>
  );
}

export const authStyles = {
  textButton: { color: ink, fontSize: 14, fontWeight: '700' as const },
};

const s = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  langs: { flexDirection: 'row', gap: 6 },
  lang: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  langOn: { backgroundColor: dusk.glow, borderColor: dusk.glow },
  langText: { color: '#DCDAF5', fontSize: 13 },
  langTextOn: { color: ink, fontWeight: '700' },
  word: { paddingHorizontal: 24, marginTop: 18 },
  sheet: {
    flexGrow: 1,
    backgroundColor: sheetBg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  title: { fontSize: 26, fontWeight: '800', color: ink, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: label, marginBottom: 6, marginStart: 2 },
  input: {
    height: 52,
    borderRadius: 14,
    backgroundColor: inputBg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  inputFocused: { borderColor: ink, backgroundColor: '#FFFFFF' },
  inputError: { borderColor: colors.danger },
  inputText: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0, textAlign: 'auto' },
  error: { color: colors.danger, fontSize: 13, marginTop: 5, marginStart: 2 },
  hint: { color: quiet, fontSize: 13, marginTop: 5, marginStart: 2 },
  primary: { height: 54, borderRadius: 16, backgroundColor: dusk.glow, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  primaryText: { color: ink, fontSize: 17, fontWeight: '800' },
  switch: { alignItems: 'center', marginTop: 18, marginBottom: 22 },
  switchText: { color: label, fontSize: 15, textAlign: 'center' },
  switchAction: { color: ink, fontWeight: '700' },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: '#DCDAE8' },
  orText: { color: quiet, fontSize: 13 },
  guest: { height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: ink, alignItems: 'center', justifyContent: 'center' },
  guestText: { color: ink, fontSize: 16, fontWeight: '700' },
  note: { color: quiet, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 10 },
});
