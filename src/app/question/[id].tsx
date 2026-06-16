import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { ApiException } from '@/api/errors';
import { createInstanceClient } from '@/api/instanceClient';
import { getCard, runCardQuery } from '@/api/endpoints';
import { useInstancesStore } from '@/store/instances';
import { CardView } from '@/render/CardView';

type InstancesState = { activeInstanceId: string | null };

/** Comfortable chart height for the standalone saved-question view. */
const QUESTION_CHART_HEIGHT = 320;

/**
 * Standalone saved-question (card) screen. Reached via an in-app route
 * (`/question/:id`) that the root auth gate already permits for authenticated
 * users. It loads the card's metadata (display / visualization settings / name)
 * and runs the card's query separately, then routes both into <CardView> inside
 * a scrollable body. Each query has its own loading spinner and themed
 * ApiException error state; an empty/null result falls back to "No data".
 */
export default function QuestionScreen(): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const cardId = Number(id);
  const instanceId = useInstancesStore((s: InstancesState) => s.activeInstanceId);

  const enabled = !!instanceId && Number.isFinite(cardId);

  const card = useQuery({
    queryKey: [instanceId, 'card', cardId],
    enabled,
    queryFn: async () => {
      const client = await createInstanceClient(instanceId as string);
      return getCard(client, cardId);
    },
  });

  const result = useQuery({
    queryKey: [instanceId, 'card-query', cardId],
    enabled,
    queryFn: async () => {
      const client = await createInstanceClient(instanceId as string);
      return runCardQuery(client, cardId);
    },
  });

  const isLoading = card.isLoading || result.isLoading;
  const error = card.error ?? result.error;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
      <View style={[styles.bar, { borderBottomColor: theme.colors.border }]}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
          <Text style={{ color: theme.colors.primary, fontSize: 16 }}>{t('dashboard.back')}</Text>
        </Pressable>
        <Text numberOfLines={1} style={[styles.barTitle, { color: theme.colors.text }]}>
          {card.data?.name ?? ''}
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
      ) : card.data && result.data ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing(4) }}>
          <CardView
            display={card.data.display}
            result={result.data}
            vizSettings={card.data.visualizationSettings}
            name={card.data.name}
            height={QUESTION_CHART_HEIGHT}
          />
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>
            {t('chart.noData')}
          </Text>
        </View>
      )}
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
});
