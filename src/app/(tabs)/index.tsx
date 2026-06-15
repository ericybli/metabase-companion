import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { ApiException } from '@/api/errors';
import { createInstanceClient } from '@/api/instanceClient';
import { listDashboards } from '@/api/endpoints';
import type { DashboardSummary } from '@/api/schemas';
import { useInstancesStore } from '@/store/instances';

export default function HomeScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const instanceId = useInstancesStore(
    (s: { activeInstanceId: string | null }) => s.activeInstanceId,
  );

  const { data, isLoading, isRefetching, error, refetch } = useQuery({
    queryKey: [instanceId, 'dashboards'],
    enabled: !!instanceId,
    queryFn: async () => {
      const client = await createInstanceClient(instanceId as string);
      return listDashboards(client);
    },
  });

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    const kind = error instanceof ApiException ? error.error.kind : 'unknown';
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.danger, textAlign: 'center' }}>
          {t('errors.generic')} ({kind})
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => refetch()}
          style={[
            styles.retry,
            { borderColor: theme.colors.border, borderRadius: theme.radius.md },
          ]}
        >
          <Text style={{ color: theme.colors.text }}>{t('common.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing(4), gap: theme.spacing(3) }}
      data={data ?? []}
      keyExtractor={(item) => String(item.id)}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={theme.colors.primary}
        />
      }
      ListHeaderComponent={
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('home.title')}</Text>
      }
      ListEmptyComponent={
        <Text style={{ color: theme.colors.textMuted, textAlign: 'center', marginTop: 32 }}>
          {t('home.empty')}
        </Text>
      }
      renderItem={({ item }: { item: DashboardSummary }) => (
        <Pressable
          testID={`dashboard-${item.id}`}
          accessibilityRole="button"
          onPress={() => router.push(`/dashboard/${item.id}`)}
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{item.name}</Text>
          {item.description ? (
            <Text numberOfLines={2} style={{ color: theme.colors.textMuted, marginTop: 4 }}>
              {item.description}
            </Text>
          ) : null}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  card: { padding: 16, borderWidth: 1 },
  cardTitle: { fontSize: 17, fontWeight: '600' },
  retry: { borderWidth: 1, paddingVertical: 10, paddingHorizontal: 20 },
});
