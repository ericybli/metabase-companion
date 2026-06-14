import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { normalizeBaseUrl } from '@/lib/url';
import { fetchSessionProperties } from '@/auth/session';
import { setSessionProps } from '@/auth/sessionPropsCache';
import { useInstancesStore } from '@/store/instances';
import type { Instance } from '@/auth/types';

export default function SetupScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const addInstance = useInstancesStore(
    (s: { addInstance: (i: Instance) => void }) => s.addInstance,
  );
  const setActiveInstance = useInstancesStore(
    (s: { setActiveInstance: (id: string) => void }) => s.setActiveInstance,
  );

  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConnect() {
    setError(null);
    let baseUrl: string;
    try {
      baseUrl = normalizeBaseUrl(url);
    } catch {
      setError(t('errors.invalidUrl'));
      return;
    }
    setBusy(true);
    try {
      const props = await fetchSessionProperties(baseUrl);
      const instance: Instance = {
        id: baseUrl,
        baseUrl,
        siteName: props.siteName,
        version: props.version,
      };
      setSessionProps(instance.id, props);
      addInstance(instance);
      setActiveInstance(instance.id);
      router.replace('/login');
    } catch {
      setError(t('errors.unreachable'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={{ gap: theme.spacing(3) }}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('setup.title')}</Text>
        <Text style={{ color: theme.colors.textMuted }}>{t('setup.urlLabel')}</Text>
        <TextInput
          testID="setup-url"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder={t('setup.urlPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              padding: theme.spacing(3),
            },
          ]}
        />
        {error ? (
          <Text testID="setup-error" style={{ color: theme.colors.danger }}>
            {error}
          </Text>
        ) : null}
        <Pressable
          testID="setup-connect"
          accessibilityRole="button"
          disabled={busy}
          onPress={onConnect}
          style={[
            styles.button,
            {
              backgroundColor: theme.colors.primary,
              borderRadius: theme.radius.md,
              opacity: busy ? 0.6 : 1,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>{t('setup.connect')}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '700' },
  input: { borderWidth: 1 },
  button: { alignItems: 'center', paddingVertical: 14 },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
});
