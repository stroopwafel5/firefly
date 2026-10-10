import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';

/**
 * Shows what went wrong instead of a blank screen. Deliberately uses no translations or theme
 * (they may be what failed); the message is in English, Hebrew and Russian.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Firefly crashed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Something went wrong · משהו השתבש · Что-то пошло не так</Text>
        <ScrollView style={styles.box}>
          <Text selectable style={styles.mono}>{`${error.name}: ${error.message}\n\n${error.stack ?? ''}`.slice(0, 4000)}</Text>
        </ScrollView>
        <Pressable style={styles.button} onPress={() => this.setState({ error: null })}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, paddingTop: 64, backgroundColor: '#1B1B3A' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  box: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: 12 },
  mono: { color: '#FFD8A8', fontFamily: 'monospace', fontSize: 12 },
  button: { marginTop: 16, backgroundColor: '#F28C28', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
});
