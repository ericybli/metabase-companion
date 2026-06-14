import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { MetabaseClient } from '@/api/client';
import { logout } from '@/auth/session';
import { deleteCredentials, deleteToken, getToken } from '@/auth/secureStore';
import { useInstancesStore } from '@/store/instances';
import { usePreferencesStore } from '@/store/preferences';
import { changeLanguage } from '@/ui/i18n';

type ThemeMode = 'system' | 'light' | 'dark';
type Locale = 'system' | 'en' | 'zh';

export default function SettingsScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const instanceId = useInstancesStore(
    (s: { activeInstanceId: string | null }) => s.activeInstanceId,
  );
  const setActiveInstance = useInstancesStore(
    (s: { setActiveInstance: (id: string | null) => void }) => s.setActiveInstance,
  );
  const themeMode = usePreferencesStore((s: { themeMode: ThemeMode }) => s.themeMode);
  const setThemeMode = usePreferencesStore(
    (s: { setThemeMode: (m: ThemeMode) => void }) => s.setThemeMode,
  );
  const locale = usePreferencesStore((s: { locale: Locale }) => s.locale);
  const setLocale = usePreferencesStore((s: { setLocale: (l: Locale) => void }) => s.setLocale);

  async function onLogout() {
    if (instanceId) {
      try {
        const token = await getToken(instanceId);
        if (token) {
          await logout(
            new MetabaseClient({
              baseUrl: instanceId,
              getToken: () => token,
              onUnauthorized: async () => null,
            }),
          );
        }
      } catch {
        /* best-effort server logout; still clear local state */
      }
      await deleteToken(instanceId);
      await deleteCredentials(instanceId);
    }
    setActiveInstance(null);
    router.replace('/login');
  }

  function onSelectLocale(next: Locale) {
    setLocale(next);
    void changeLanguage(next);
  }

  const themeOptions: { mode: ThemeMode; label: string; tid: string }[] = [
    { mode: 'system', label: t('settings.themeSystem'), tid: 'theme-system' },
    { mode: 'light', label: t('settings.themeLight'), tid: 'theme-light' },
    { mode: 'dark', label: t('settings.themeDark'), tid: 'theme-dark' },
  ];
  const localeOptions: { value: Locale; label: string; tid: string }[] = [
    { value: 'system', label: t('settings.langSystem'), tid: 'lang-system' },
    { value: 'en', label: 'English', tid: 'lang-en' },
    { value: 'zh', label: '中文', tid: 'lang-zh' },
  ];

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing(4), gap: theme.spacing(5) }}
    >
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={[styles.section, { color: theme.colors.textMuted }]}>
          {t('settings.theme')}
        </Text>
        <View style={styles.row}>
          {themeOptions.map((opt) => {
            const active = themeMode === opt.mode;
            return (
              <Pressable
                key={opt.mode}
                testID={opt.tid}
                accessibilityRole="button"
                onPress={() => setThemeMode(opt.mode)}
                style={[
                  styles.chip,
                  {
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                    backgroundColor: active ? theme.colors.primary : 'transparent',
                    borderRadius: theme.radius.sm,
                  },
                ]}
              >
                <Text style={{ color: active ? '#FFFFFF' : theme.colors.text }}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: theme.spacing(2) }}>
        <Text style={[styles.section, { color: theme.colors.textMuted }]}>
          {t('settings.language')}
        </Text>
        <View style={styles.row}>
          {localeOptions.map((opt) => {
            const active = locale === opt.value;
            return (
              <Pressable
                key={opt.value}
                testID={opt.tid}
                accessibilityRole="button"
                onPress={() => onSelectLocale(opt.value)}
                style={[
                  styles.chip,
                  {
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                    backgroundColor: active ? theme.colors.primary : 'transparent',
                    borderRadius: theme.radius.sm,
                  },
                ]}
              >
                <Text style={{ color: active ? '#FFFFFF' : theme.colors.text }}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        testID="settings-logout"
        accessibilityRole="button"
        onPress={onLogout}
        style={[styles.logout, { borderColor: theme.colors.danger, borderRadius: theme.radius.md }]}
      >
        <Text style={{ color: theme.colors.danger, fontWeight: '600' }}>
          {t('settings.logout')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14 },
  logout: { borderWidth: 1, alignItems: 'center', paddingVertical: 14, marginTop: 8 },
});
