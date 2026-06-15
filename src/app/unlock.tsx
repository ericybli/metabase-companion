import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { authenticate } from '@/auth/biometrics';
import { deleteToken } from '@/auth/secureStore';
import { useInstancesStore } from '@/store/instances';
import { useSessionLockStore } from '@/store/sessionLock';

export default function UnlockScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const instanceId = useInstancesStore(
    (s: { activeInstanceId: string | null }) => s.activeInstanceId,
  );
  const setActiveInstance = useInstancesStore(
    (s: { setActiveInstance: (id: string | null) => void }) => s.setActiveInstance,
  );
  const setUnlocked = useSessionLockStore((s) => s.setUnlocked);

  const [status, setStatus] = useState<'pending' | 'failed'>('pending');

  // Prompt for biometrics once on mount. The async continuation (where setState
  // runs) is not synchronous within the effect body, so it never loops.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await authenticate(t('unlock.prompt'));
      if (cancelled) return;
      if (ok) {
        setUnlocked(true);
        router.replace('/(tabs)');
      } else {
        setStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run only on mount; `t`/`router` identity changes must not re-trigger the prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRetry() {
    setStatus('pending');
    const ok = await authenticate(t('unlock.prompt'));
    if (ok) {
      setUnlocked(true);
      router.replace('/(tabs)');
    } else {
      setStatus('failed');
    }
  }

  async function onLogout() {
    if (instanceId) {
      await deleteToken(instanceId);
    }
    setActiveInstance(null);
    setUnlocked(false);
    router.replace('/login');
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{t('unlock.title')}</Text>
      {status === 'pending' ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : (
        <View style={{ gap: theme.spacing(3), marginTop: theme.spacing(4) }}>
          <Pressable
            testID="unlock-retry"
            accessibilityRole="button"
            onPress={onRetry}
            style={[
              styles.button,
              { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md },
            ]}
          >
            <Text style={styles.buttonText}>{t('unlock.retry')}</Text>
          </Pressable>
          <Pressable
            testID="unlock-logout"
            accessibilityRole="button"
            onPress={onLogout}
            style={[
              styles.buttonOutline,
              { borderColor: theme.colors.border, borderRadius: theme.radius.md },
            ]}
          >
            <Text style={{ color: theme.colors.danger, fontWeight: '600' }}>
              {t('unlock.logout')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  button: { alignItems: 'center', paddingVertical: 14, paddingHorizontal: 32 },
  buttonOutline: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderWidth: 1,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
});
