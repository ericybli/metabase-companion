import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { fetchSessionProperties, loginWithPassword } from '@/auth/session';
import { loginWithGoogle } from '@/auth/googleAuth';
import { saveCredentials, saveToken } from '@/auth/secureStore';
import { useInstancesStore } from '@/store/instances';
import { usePreferencesStore } from '@/store/preferences';
import { useAuthRevisionStore } from '@/store/authRevision';
import { getSessionProps, setSessionProps } from '@/auth/sessionPropsCache';
import type { Theme } from '@/ui/theme';

export default function LoginScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const instanceId = useInstancesStore(
    (s: { activeInstanceId: string | null }) => s.activeInstanceId,
  );
  const rememberCredentials = usePreferencesStore(
    (s: { rememberCredentials: boolean }) => s.rememberCredentials,
  );
  const setRememberCredentials = usePreferencesStore(
    (s: { setRememberCredentials: (v: boolean) => void }) => s.setRememberCredentials,
  );
  const bumpAuthRevision = useAuthRevisionStore((s) => s.bumpAuthRevision);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | null>(
    instanceId ? (getSessionProps(instanceId)?.googleAuthClientId ?? null) : null,
  );

  // Refetch properties if not cached, so the Google button can appear.
  useEffect(() => {
    if (!instanceId || getSessionProps(instanceId)) return;
    let cancelled = false;
    void (async () => {
      try {
        const props = await fetchSessionProperties(instanceId);
        if (cancelled) return;
        setSessionProps(instanceId, props);
        setGoogleClientId(props.googleAuthClientId);
      } catch {
        /* leave Google hidden; password login still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [instanceId]);

  async function onPasswordLogin() {
    if (!instanceId) return;
    setError(null);
    setBusy(true);
    try {
      const token = await loginWithPassword(instanceId, email, password);
      await saveToken(instanceId, token);
      if (rememberCredentials) {
        await saveCredentials(instanceId, email, password);
      }
      bumpAuthRevision();
      router.replace('/(tabs)');
    } catch (e) {
      const kind = (e as { error?: { kind?: string } })?.error?.kind;
      setError(kind === 'unauthorized' ? t('errors.unauthorized') : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogleLogin() {
    if (!instanceId || !googleClientId) return;
    setError(null);
    setBusy(true);
    try {
      const token = await loginWithGoogle(instanceId, googleClientId);
      await saveToken(instanceId, token);
      bumpAuthRevision();
      router.replace('/(tabs)');
    } catch {
      setError(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={{ gap: theme.spacing(3) }}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('login.title')}</Text>

        <TextInput
          testID="login-email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder={t('common.email')}
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, inputStyle(theme)]}
        />
        <TextInput
          testID="login-password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder={t('common.password')}
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, inputStyle(theme)]}
        />

        <View style={styles.row}>
          <Text style={{ color: theme.colors.text }}>{t('login.rememberMe')}</Text>
          <Switch
            testID="login-remember"
            value={rememberCredentials}
            onValueChange={setRememberCredentials}
          />
        </View>

        {error ? (
          <Text testID="login-error" style={{ color: theme.colors.danger }}>
            {error}
          </Text>
        ) : null}

        <Pressable
          testID="login-submit"
          accessibilityRole="button"
          disabled={busy}
          onPress={onPasswordLogin}
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
            <Text style={styles.buttonText}>{t('login.signIn')}</Text>
          )}
        </Pressable>

        {googleClientId ? (
          <Pressable
            testID="login-google"
            accessibilityRole="button"
            disabled={busy}
            onPress={onGoogleLogin}
            style={[
              styles.buttonOutline,
              { borderColor: theme.colors.border, borderRadius: theme.radius.md },
            ]}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '600' }}>{t('login.google')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function inputStyle(theme: Theme) {
  return {
    color: theme.colors.text,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing(3),
  };
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '700' },
  input: { borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  button: { alignItems: 'center', paddingVertical: 14 },
  buttonOutline: { alignItems: 'center', paddingVertical: 14, borderWidth: 1 },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
});
