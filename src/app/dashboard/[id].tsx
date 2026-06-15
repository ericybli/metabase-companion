import React from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { ApiException } from '@/api/errors';
import { createInstanceClient } from '@/api/instanceClient';
import { getDashboard, runDashcardQuery } from '@/api/endpoints';
import type { DashboardCard, DashboardParameter, DashboardTab } from '@/api/schemas';
import { useInstancesStore } from '@/store/instances';
import { CardView } from '@/render/CardView';
import { FiltersBar } from './FiltersBar';

type InstancesState = { activeInstanceId: string | null };
type CardParam = { id: string; value: unknown };

/** Seed the param value map from the dashboard's parameter defaults (non-null only). */
function defaultParamValues(parameters: DashboardParameter[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const p of parameters) {
    if (p.default != null) next[p.id] = p.default;
  }
  return next;
}

/** Build the runDashcardQuery params from applied values, omitting empty entries. */
function toCardParams(values: Record<string, unknown>): CardParam[] {
  return Object.entries(values)
    .filter(([, value]) => value != null && value !== '')
    .map(([id, value]) => ({ id, value }));
}

/** The card the user tapped, plus the resolved params used to query it. */
type SelectedCard = { card: DashboardCard; params: CardParam[] };

export default function DashboardScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const dashboardId = Number(id);
  const instanceId = useInstancesStore((s: InstancesState) => s.activeInstanceId);

  // The card opened in the fullscreen modal, or null when the modal is closed.
  const [selected, setSelected] = React.useState<SelectedCard | null>(null);
  const [selectedTabId, setSelectedTabId] = React.useState<number | null>(null);
  // The currently-applied filter values, keyed by parameter id. Seeded from the
  // dashboard's parameter defaults once it loads; replaced wholesale on Apply.
  const [paramValues, setParamValues] = React.useState<Record<string, unknown>>({});
  // Once seeded from the loaded parameter defaults, don't clobber user edits.
  const seededRef = React.useRef(false);

  const { data, isLoading, error } = useQuery({
    queryKey: [instanceId, 'dashboard', dashboardId],
    enabled: !!instanceId && Number.isFinite(dashboardId),
    queryFn: async () => {
      const client = await createInstanceClient(instanceId as string);
      return getDashboard(client, dashboardId);
    },
  });

  const parameters: DashboardParameter[] = React.useMemo(
    () => data?.parameters ?? [],
    [data?.parameters],
  );

  React.useEffect(() => {
    if (seededRef.current) return;
    if (parameters.length === 0) return;
    setParamValues(defaultParamValues(parameters));
    seededRef.current = true;
  }, [parameters]);

  const cardParams = React.useMemo(() => toCardParams(paramValues), [paramValues]);

  const tabs: DashboardTab[] = React.useMemo(() => data?.tabs ?? [], [data?.tabs]);
  // When tabs first load, default-select the first one.
  const effectiveTabId = tabs.length > 0 ? (selectedTabId ?? tabs[0]?.id ?? null) : null;

  // Cards to display: if tabs present, filter by selected tab.
  // Cards with tabId null are shown under the first tab.
  const firstTabId = tabs[0]?.id ?? null;
  const visibleCards = React.useMemo(() => {
    const allCards = data?.cards ?? [];
    if (tabs.length === 0) return allCards;
    return allCards.filter((c) => {
      if (c.tabId === null) return effectiveTabId === firstTabId;
      return c.tabId === effectiveTabId;
    });
  }, [data?.cards, tabs, effectiveTabId, firstTabId]);

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

      <FiltersBar parameters={parameters} values={paramValues} onApply={setParamValues} />

      {tabs.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
          contentContainerStyle={{ paddingHorizontal: theme.spacing(4) }}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === effectiveTabId;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                onPress={() => setSelectedTabId(tab.id)}
                style={[
                  styles.tabItem,
                  isActive && { borderBottomColor: theme.colors.primary, borderBottomWidth: 2 },
                ]}
              >
                <Text
                  style={{
                    color: isActive ? theme.colors.primary : theme.colors.textMuted,
                    fontWeight: isActive ? '600' : '400',
                    fontSize: 14,
                  }}
                >
                  {tab.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

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
          data={visibleCards}
          keyExtractor={(c) => String(c.dashcardId)}
          ListEmptyComponent={
            <Text style={{ color: theme.colors.textMuted, textAlign: 'center', marginTop: 32 }}>
              {t('dashboard.empty')}
            </Text>
          }
          renderItem={({ item }: { item: DashboardCard }) => (
            <DashcardItem
              dashboardId={dashboardId}
              card={item}
              params={cardParams}
              onPress={() => setSelected({ card: item, params: cardParams })}
            />
          )}
        />
      )}

      <DashcardModal
        dashboardId={dashboardId}
        selected={selected}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

/**
 * The single source of truth for a dashcard's query. Both the inline card and
 * the fullscreen modal call this with the same arguments, so they share one
 * React Query cache entry (same queryKey + queryFn) — the modal renders from
 * cache instantly with no refetch.
 */
function useDashcardQuery(dashboardId: number, card: DashboardCard, params: CardParam[]) {
  const instanceId = useInstancesStore((s: InstancesState) => s.activeInstanceId);
  return useQuery({
    queryKey: [instanceId, 'dashcard', dashboardId, card.dashcardId, JSON.stringify(params)],
    enabled: !!instanceId && Number.isFinite(dashboardId),
    queryFn: async () => {
      const client = await createInstanceClient(instanceId as string);
      return runDashcardQuery(client, dashboardId, card.dashcardId, card.cardId, params);
    },
  });
}

/**
 * A single dashboard card: its own query for the card's data plus a titled
 * container that shows a spinner while loading, a themed error with the
 * ApiException kind on failure, or the routed <CardView> on success.
 *
 * Wrapped in a Pressable so tapping opens a fullscreen modal of the same card.
 * Rendered as a component (not inline in FlatList's renderItem) so that its
 * useQuery hook is called from a stable component, not conditionally.
 */
function DashcardItem({
  dashboardId,
  card,
  params,
  onPress,
}: {
  dashboardId: number;
  card: DashboardCard;
  params: CardParam[];
  onPress: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const { data, isLoading, error } = useDashcardQuery(dashboardId, card, params);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={card.name}
      onPress={onPress}
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
    </Pressable>
  );
}

/**
 * Fullscreen modal showing the tapped card large. It reuses {@link
 * useDashcardQuery} with the exact same arguments as the inline card, so React
 * Query serves the cached result instantly. The body honours loading, the
 * per-card ApiException error, and an empty/null result, and wraps the
 * <CardView> in a ScrollView so wide tables and tall charts can scroll.
 */
function DashcardModal({
  dashboardId,
  selected,
  onClose,
}: {
  dashboardId: number;
  selected: SelectedCard | null;
  onClose: () => void;
}): React.ReactElement {
  return (
    <Modal
      visible={selected != null}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      {selected != null ? (
        <DashcardModalContent
          dashboardId={dashboardId}
          card={selected.card}
          params={selected.params}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}

function DashcardModalContent({
  dashboardId,
  card,
  params,
  onClose,
}: {
  dashboardId: number;
  card: DashboardCard;
  params: CardParam[];
  onClose: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error } = useDashcardQuery(dashboardId, card, params);
  // Landscape toggle: rotate the card content 90° so wide charts read sideways.
  // Pure transform (no expo-screen-orientation, which needs a dev build).
  const [landscape, setLandscape] = React.useState(false);

  const body = data ? (
    <ScrollView contentContainerStyle={{ padding: theme.spacing(4) }}>
      <CardView
        display={card.display ?? 'table'}
        result={data}
        vizSettings={card.vizSettings}
        name={card.name}
      />
    </ScrollView>
  ) : (
    <View style={styles.center}>
      <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>
        {t('chart.noData')}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
      <View style={[styles.bar, { borderBottomColor: theme.colors.border }]}>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
          <Text style={{ color: theme.colors.primary, fontSize: 16 }}>{t('dashboard.back')}</Text>
        </Pressable>
        <Text numberOfLines={1} style={[styles.barTitle, { color: theme.colors.text }]}>
          {card.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: landscape }}
          testID="fullscreen-rotate"
          onPress={() => setLandscape((v) => !v)}
          hitSlop={8}
          style={{ width: 48, alignItems: 'flex-end' }}
        >
          <Text
            style={{
              color: landscape ? theme.colors.primary : theme.colors.textMuted,
              fontSize: 16,
            }}
          >
            {t('dashboard.rotate')}
          </Text>
        </Pressable>
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
      ) : landscape ? (
        <RotatedContainer testID="fullscreen-rotated">{body}</RotatedContainer>
      ) : (
        body
      )}
    </View>
  );
}

/**
 * Rotate its children 90° and size them to fill (width/height swapped against
 * the screen Dimensions) so wide charts/tables read sideways in a portrait
 * Modal. Pure CSS-style transform — works in Expo Go (no native orientation).
 */
function RotatedContainer({
  children,
  testID,
}: {
  children: React.ReactNode;
  testID?: string;
}): React.ReactElement {
  const { width, height } = Dimensions.get('window');
  return (
    <View style={styles.rotateWrap}>
      <View
        testID={testID}
        style={{
          width: height,
          height: width,
          transform: [{ rotate: '90deg' }],
        }}
      >
        {children}
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
  rotateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  card: { padding: 16, borderWidth: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardBody: { marginTop: 12 },
  tabItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 4,
  },
});
