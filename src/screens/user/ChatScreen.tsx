import React, { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { IconButton, Loading, toast } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import type { RootScreen } from '../../navigation/types';
import { ChatMessage, ensureChat, sendMessage, watchMessages } from '../../services/social';
import { colors, font, radius, space } from '../../theme';
import { tintFor } from '../../components/Tint';

const tint = tintFor(colors.planner);

/** Direct, live chat between two friends (Firestore real-time listeners). */
export function ChatScreen({ route, navigation }: RootScreen<'Chat'>) {
  const { t, clock } = useI18n();
  const { profile } = useAuth();
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const list = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    navigation.setOptions({ title: route.params.name });
    if (!profile) return;
    let off: (() => void) | undefined;
    ensureChat(profile.uid, route.params.uid)
      .then((id) => {
        setChatId(id);
        off = watchMessages(id, setMessages);
      })
      .catch(() => toast(t('common.error')));
    return () => off?.();
  }, [profile, route.params.uid, route.params.name, navigation, t]);

  if (!profile || !chatId) return <Loading />;

  const send = async () => {
    const body = text;
    setText('');
    try {
      await sendMessage(chatId, profile.uid, body);
    } catch {
      setText(body);
      toast(t('common.error'));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tint.page }} behavior="height">
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: space.lg }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const mine = item.from === profile.uid;
          const d = new Date(item.createdAt);
          return (
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={[font.body, mine && { color: '#fff' }]}>{item.text}</Text>
              <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.75)' }]}>{clock(d.getHours() * 60 + d.getMinutes())}</Text>
            </View>
          );
        }}
      />
      <View style={styles.inputRow}>
        <TextInput style={styles.input} value={text} onChangeText={setText} placeholder={t('user.typeMessage')} placeholderTextColor={colors.muted} multiline maxLength={2000} />
        <IconButton icon="send" color={colors.planner} label={t('user.send')} onPress={send} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '80%', borderRadius: radius.lg, padding: space.md, marginBottom: space.sm },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.planner },
  theirs: { alignSelf: 'flex-start', backgroundColor: tint.surface },
  time: { fontSize: 10, color: colors.muted, alignSelf: 'flex-end', marginTop: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', padding: space.sm, backgroundColor: tint.field, borderTopWidth: 1, borderTopColor: tint.line },
  input: { flex: 1, maxHeight: 120, paddingHorizontal: space.md, fontSize: 15, color: colors.text },
});
