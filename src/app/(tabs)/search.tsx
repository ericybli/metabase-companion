import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { ApiException } from '@/api/errors';
import { createInstanceClient } from '@/api/instanceClient';
import { search } from '@/api/endpoints';
import type { SearchResult } from '@/api/schemas';
import { useInstancesStore } from '@/store/instances';
import type { InstancesState } from '@/store/instances';

/** Wait this long after the last keystroke before firing a query. */
const DEBOUNCE_MS = 300;
/** Don't search until the user has typed at least this many characters. */
const MIN_QUERY_LENGTH = 2;

/** Models we know how to open, mapped to their in-app route prefix. */
const ROUTE_FOR_MODEL: Record<string, '/dashboard/' | '/question/'> = {
  dashboard: '/dashboard/',
  card: '/question/',
  dataset: '/question/',
  metric: '/question/',
};

/**
 * Global search tab. A debounced TextInput drives a react-query lookup against
 * GET /api/search; results render in a FlatList with a small model badge and an
 * optional description. Tapping a dashboard opens `/dashboard/:id`, while
 * card/dataset/metric results open `/question/:id`; any other model is inert.
 * Distinct loading / error / empty / "type to search" states are shown.
 */
export default function SearchScreen(): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const instanceId = useInstancesStore((s: InstancesState) => s.activeInstanceId);

  const [text, setText] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  React.useEffect(() => {
    const handle = setTimeout(() => setDebounced(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [text]);

  const enabled = !!instanceId && debounced.length >= MIN_QUERY_LENGTH;

  const { data, isLoading, error } = useQuery({
    queryKey: [instanceId, 'search', debounced],
    enabled,
    queryFn: async () => {
      const client = await createInstanceClient(instanceId as string);
      return search(client, debounced);
    },
  });

  function onPressResult(item: SearchResult): void {
    const prefix = ROUTE_FOR_MODEL[item.model];
    if (!prefix) {
      return;
    }
    router.push(`${prefix}${item.id}`);
  }

  function renderBody(): React.ReactElement {
    if (!enabled) {
      return (
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('search.prompt')}</Text>
      );
    }
    if (isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator testID="search-loading" color={theme.colors.primary} />
        </View>
      );
    }
    if (error) {
      const kind = error instanceof ApiException ? error.error.kind : 'unknown';
      return (
        <Text style={[styles.hint, { color: theme.colors.danger }]}>
          {t('errors.generic')} ({kind})
        </Text>
      );
    }
    return (
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => `${item.model}-${item.id}`}
        contentContainerStyle={{ gap: theme.spacing(3) }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('search.empty')}</Text>
        }
        renderItem={({ item }: { item: SearchResult }) => {
          const openable = !!ROUTE_FOR_MODEL[item.model];
          return (
            <Pressable
              testID={`search-result-${item.model}-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              accessibilityHint={openable ? t('search.openHint', { model: item.model }) : undefined}
              disabled={!openable}
              onPress={() => onPressResult(item)}
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  opacity: openable ? 1 : 0.6,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <Text numberOfLines={1} style={[styles.cardTitle, { color: theme.colors.text }]}>
                  {item.name}
                </Text>
                {item.model ? (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: theme.colors.border, borderRadius: theme.radius.sm },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: theme.colors.textMuted }]}>
                      {item.model}
                    </Text>
                  </View>
                ) : null}
              </View>
              {item.description ? (
                <Text numberOfLines={2} style={{ color: theme.colors.textMuted, marginTop: 4 }}>
                  {item.description}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <TextInput
        testID="search-input"
        value={text}
        onChangeText={setText}
        placeholder={t('search.placeholder')}
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={[
          styles.input,
          {
            color: theme.colors.text,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
          },
        ]}
      />
      <View style={styles.body}>{renderBody()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  input: { borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, fontSize: 16 },
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { textAlign: 'center', marginTop: 32 },
  card: { padding: 16, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  badge: { paddingVertical: 2, paddingHorizontal: 8 },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
});
