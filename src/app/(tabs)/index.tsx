import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { MetabaseClient } from '@/api/client';
import { fetchCurrentUser } from '@/auth/session';
import { getToken } from '@/auth/secureStore';
import { useInstancesStore } from '@/store/instances';

export default function HomeScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const instanceId = useInstancesStore(
    (s: { activeInstanceId: string | null }) => s.activeInstanceId,
  );

  const { data, isLoading, error } = useQuery({
    queryKey: [instanceId, 'user', 'current'],
    enabled: !!instanceId,
    queryFn: async () => {
      // Load the stored token, then build a client bound to it for this request.
      // (M0 keeps client construction local; M1 introduces a shared client provider.)
      const id = instanceId as string;
      const token = await getToken(id);
      const client = new MetabaseClient({
        baseUrl: id,
        getToken: () => token,
        onUnauthorized: async () => null,
      });
      return fetchCurrentUser(client);
    },
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {isLoading ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : error ? (
        <Text style={{ color: theme.colors.danger }}>{t('errors.generic')}</Text>
      ) : (
        <Text testID="home-greeting" style={{ color: theme.colors.text, fontSize: 18 }}>
          {t('home.signedInAs', { email: data?.email ?? '' })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
