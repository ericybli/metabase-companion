import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { ApiException } from '@/api/errors';
import { createInstanceClient } from '@/api/instanceClient';
import { getDashboard, runDashcardQuery } from '@/api/endpoints';
import type { DashboardCard } from '@/api/schemas';
import { useInstancesStore } from '@/store/instances';
import { CardView } from '@/render/CardView';

export default function DashboardScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const dashboardId = Number(id);
  const instanceId = useInstancesStore(
    (s: { activeInstanceId: string | null }) => s.activeInstanceId,
  );

  const { data, isLoading, error } = useQuery({
    queryKey: [instanceId, 'dashboard', dashboardId],
    enabled: !!instanceId && Number.isFinite(dashboardId),
    queryFn: async () => {
      const client = await createInstanceClient(instanceId as string);
      return getDashboard(client, dashboardId);
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
      <View style={[styles.bar, { borderBottomColor: theme.colors.border }]}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
          <Text style={{ color: theme.colors.primary, fontSize: 16 }}>{t('dashboard.back')}</Text>
        </Pressable>
        <Text numberOfLines={1} style={[styles.barTitle, { color: theme.colors.text }]}>
          {data?.name ?? ''}
        </Text>
        <View style={{ width: 48 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={{ color: theme.colors.danger, textAlign: 'center' }}>
            {t('errors.generic')} ({error instanceof ApiException ? error.error.kind : 'unknown'})
          </Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ padding: theme.spacing(4), gap: theme.spacing(3) }}
          data={data?.cards ?? []}
          keyExtractor={(c) => String(c.dashcardId)}
          ListEmptyComponent={
            <Text style={{ color: theme.colors.textMuted, textAlign: 'center', marginTop: 32 }}>
              {t('dashboard.empty')}
            </Text>
          }
          renderItem={({ item }: { item: DashboardCard }) => (
            <DashcardItem dashboardId={dashboardId} card={item} />
          )}
        />
      )}
    </View>
  );
}

/**
 * A single dashboard card: its own query for the card's data plus a titled
 * container that shows a spinner while loading, a themed error with the
 * ApiException kind on failure, or the routed <CardView> on success.
 *
 * Rendered as a component (not inline in FlatList's renderItem) so that its
 * useQuery hook is called from a stable component, not conditionally.
 */
function DashcardItem({
  dashboardId,
  card,
}: {
  dashboardId: number;
  card: DashboardCard;
}): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const instanceId = useInstancesStore(
    (s: { activeInstanceId: string | null }) => s.activeInstanceId,
  );

  const { data, isLoading, error } = useQuery({
    queryKey: [instanceId, 'dashcard', dashboardId, card.dashcardId],
    enabled: !!instanceId && Number.isFinite(dashboardId),
    queryFn: async () => {
      const client = await createInstanceClient(instanceId as string);
      return runDashcardQuery(client, dashboardId, card.dashcardId, card.cardId);
    },
  });

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
        },
      ]}
    >
      <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{card.name}</Text>
      <View style={styles.cardBody}>
        {isLoading ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : error ? (
          <Text style={{ color: theme.colors.danger }}>
            {t('errors.generic')} ({error instanceof ApiException ? error.error.kind : 'unknown'})
          </Text>
        ) : data ? (
          <CardView
            display={card.display ?? 'table'}
            result={data}
            vizSettings={card.vizSettings}
            name={card.name}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  barTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', marginHorizontal: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { padding: 16, borderWidth: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardBody: { marginTop: 12 },
});
