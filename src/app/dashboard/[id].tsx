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
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { ApiException } from '@/api/errors';
import { createInstanceClient } from '@/api/instanceClient';
import { getDashboard, getParameterValues, runDashcardQuery } from '@/api/endpoints';
import type { DashboardCard, DashboardParameter, DashboardTab } from '@/api/schemas';
import { useInstancesStore } from '@/store/instances';
import { CardView } from '@/render/CardView';
import { settableFilterParams, type PointSelectInfo } from '@/viz/drill/pointSelect';
import { FiltersBar } from './FiltersBar';

type InstancesState = { activeInstanceId: string | null };
type CardParam = { id: string; value: unknown };

/** A tapped chart point, captured for the drill-through action sheet. */
type DrillTarget = { card: DashboardCard; info: PointSelectInfo };

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
  // The tapped chart point driving the drill-through sheet, or null when closed.
  const [drill, setDrill] = React.useState<DrillTarget | null>(null);
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

  // Cross-filter: set a dashboard parameter to the clicked point's label, then
  // close the drill sheet so the connected cards refetch with the new value.
  // (Read-only: this only mutates parameterValues — no navigation, no new query.)
  const applyCrossFilter = React.useCallback((paramId: string, value: string): void => {
    setParamValues((prev) => ({ ...prev, [paramId]: value }));
    setDrill(null);
  }, []);

  // Lazily fetch selectable values for a field/card-backed parameter (used by
  // the FiltersBar dropdowns). Builds an instance client per call, mirroring the
  // dashboard/dashcard queries above.
  const fetchParamValues = React.useCallback(
    async (paramId: string): Promise<string[]> => {
      if (!instanceId) return [];
      const client = await createInstanceClient(instanceId);
      return getParameterValues(client, dashboardId, paramId);
    },
    [instanceId, dashboardId],
  );

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

      <FiltersBar
        parameters={parameters}
        values={paramValues}
        onApply={setParamValues}
        fetchParamValues={fetchParamValues}
      />

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
              onPointSelect={(info) => setDrill({ card: item, info })}
            />
          )}
        />
      )}

      <DashcardModal
        dashboardId={dashboardId}
        selected={selected}
        onClose={() => setSelected(null)}
      />

      <DrillSheet
        drill={drill}
        parameters={parameters}
        onApplyFilter={applyCrossFilter}
        onClose={() => setDrill(null)}
      />
    </View>
  );
}

/**
 * Drill-through bottom action sheet shown when a chart point is tapped. It always
 * surfaces the clicked point's details — the dimension label and one row per
 * series ("{name}: {value}") — and, when the dashboard has at least one settable
 * (string/category/id) parameter, offers a one-tap "Filter: {param} = {label}"
 * per such parameter. Tapping a Filter button writes the clicked dimension label
 * into that parameter (cross-filter) and dismisses the sheet so connected cards
 * refetch. With no settable parameter it is a read-only details view.
 */
function DrillSheet({
  drill,
  parameters,
  onApplyFilter,
  onClose,
}: {
  drill: DrillTarget | null;
  parameters: DashboardParameter[];
  onApplyFilter: (paramId: string, value: string) => void;
  onClose: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const filterable = React.useMemo(() => settableFilterParams(parameters), [parameters]);

  return (
    <Modal visible={drill != null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('dashboard.close')}
        testID="drill-backdrop"
        style={styles.drillBackdrop}
        onPress={onClose}
      >
        {/* Inner Pressable swallows taps on the sheet so they don't dismiss it. */}
        <Pressable
          testID="drill-sheet"
          style={[
            styles.drillSheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderTopLeftRadius: theme.radius.md,
              borderTopRightRadius: theme.radius.md,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          {drill != null ? (
            <>
              <Text style={[styles.drillHeader, { color: theme.colors.text }]} numberOfLines={2}>
                {drill.info.label}
              </Text>
              {drill.info.points.map((p, i) => (
                <Text
                  key={`drill-pt-${i}`}
                  style={[styles.drillRow, { color: theme.colors.textMuted }]}
                  numberOfLines={1}
                >
                  {p.name}: {p.value}
                </Text>
              ))}
              {filterable.map((param) => (
                <Pressable
                  key={`drill-filter-${param.id}`}
                  accessibilityRole="button"
                  testID={`drill-filter-${param.id}`}
                  onPress={() => onApplyFilter(param.id, drill.info.label)}
                  style={[
                    styles.drillFilterButton,
                    { backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm },
                  ]}
                >
                  <Text style={styles.drillFilterText} numberOfLines={1}>
                    {t('dashboard.filterBy', { name: param.name, value: drill.info.label })}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                testID="drill-close"
                onPress={onClose}
                style={styles.drillClose}
              >
                <Text style={{ color: theme.colors.primary, fontSize: 16 }}>
                  {t('dashboard.close')}
                </Text>
              </Pressable>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
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
  onPointSelect,
}: {
  dashboardId: number;
  card: DashboardCard;
  params: CardParam[];
  onPress: () => void;
  onPointSelect: (info: PointSelectInfo) => void;
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
            onPointSelect={onPointSelect}
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

/** Top-bar chrome (back / title / rotate row) reserved out of the chart area. */
const TOP_BAR_HEIGHT = 48;
/** Comfortable chart height in the portrait (non-rotated) fullscreen view. */
const PORTRAIT_CHART_HEIGHT = 300;
/** Pinch-to-zoom scale clamp for the fullscreen chart. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

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

  // Swapped screen dimensions for the rotated viewport. The rotated content's
  // visual WIDTH spans the screen height, and its visual HEIGHT spans the screen
  // width minus the top-bar chrome + insets — so the chart fills the rotated
  // area instead of staying ~220 tall and being cut off.
  const screen = Dimensions.get('window');
  const rotatedWidth = screen.height - insets.top - TOP_BAR_HEIGHT;
  const rotatedHeight = screen.width;
  const padding = theme.spacing(4);
  // Height handed to the chart so it fills the rotated area (vs ~220 default).
  // Reserve room for padding, the (single) title/legend row, and x-axis labels.
  const landscapeChartHeight = Math.max(220, rotatedWidth - padding * 2 - 64);

  const renderBody = (chartHeight: number): React.ReactElement =>
    data ? (
      <ZoomableContent>
        <ScrollView contentContainerStyle={{ padding }}>
          <CardView
            display={card.display ?? 'table'}
            result={data}
            vizSettings={card.vizSettings}
            name={card.name}
            height={chartHeight}
          />
        </ScrollView>
      </ZoomableContent>
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
        <RotatedContainer testID="fullscreen-rotated" width={rotatedWidth} height={rotatedHeight}>
          {renderBody(landscapeChartHeight)}
        </RotatedContainer>
      ) : (
        renderBody(PORTRAIT_CHART_HEIGHT)
      )}
    </View>
  );
}

/**
 * Pinch-to-zoom + pan wrapper for the fullscreen chart. A {@link GestureDetector}
 * combines a Pinch (scale), a Pan (translate), and a double-Tap (reset) gesture,
 * all driving reanimated shared values applied via an inner Animated.View
 * transform. Scale is clamped to [MIN_ZOOM, MAX_ZOOM]; a double-tap animates back
 * to identity. The zoom transform lives on an *inner* Animated.View so it composes
 * with the outer {@link RotatedContainer}'s rotate transform rather than fighting
 * it. A single tap is allowed to fall through to the chart's tap-for-value tooltip
 * (the pan gesture requires the single-tap to fail first via Gesture.Exclusive),
 * so tapping a data point still works when not actively panning.
 *
 * Only used in the fullscreen modal — inline cards keep their plain behavior.
 * Gesture-handler + reanimated only, so it stays Expo-Go-safe.
 */
function ZoomableContent({ children }: { children: React.ReactNode }): React.ReactElement {
  const { t } = useTranslation();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const reset = React.useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      'worklet';
      const next = savedScale.value * e.scale;
      scale.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    })
    .onEnd(() => {
      'worklet';
      savedScale.value = scale.value;
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      'worklet';
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      'worklet';
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Single tap must fail before pan begins so a lone tap reaches the chart's
  // tap-for-value tooltip instead of being swallowed as a (zero-distance) pan.
  const singleTap = Gesture.Tap().numberOfTaps(1);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      runOnJS(reset)();
    });

  // Double-tap wins over single-tap; pan only starts once single-tap fails.
  const tap = Gesture.Exclusive(doubleTap, singleTap);
  const composed = Gesture.Race(tap, Gesture.Simultaneous(pinch, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={styles.zoomWrap}>
      <GestureDetector gesture={composed}>
        <Animated.View testID="fullscreen-zoom" style={[styles.zoomInner, animatedStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
      {/* Accessible, testable reset that mirrors the double-tap gesture (gestures
          themselves are not exercisable under the reanimated/gesture jest mocks). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('dashboard.resetZoom')}
        testID="fullscreen-zoom-reset"
        onPress={reset}
        hitSlop={8}
        style={styles.zoomReset}
      >
        <Text style={styles.zoomResetText}>⤢</Text>
      </Pressable>
    </View>
  );
}

/**
 * Rotate its children 90° and size them to fill the rotated viewport. The
 * caller passes the SWAPPED screen dimensions: `width` is the rotated content's
 * cross-axis (= screen height minus chrome) and `height` is its main axis
 * (= screen width). Centered so nothing is clipped. Pure CSS-style transform —
 * works in Expo Go (no native orientation).
 */
function RotatedContainer({
  children,
  testID,
  width,
  height,
}: {
  children: React.ReactNode;
  testID?: string;
  width: number;
  height: number;
}): React.ReactElement {
  return (
    <View style={styles.rotateWrap}>
      <View
        testID={testID}
        style={{
          width,
          height,
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
  zoomWrap: { flex: 1, overflow: 'hidden' },
  zoomInner: { flex: 1 },
  zoomReset: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  zoomResetText: { color: '#fff', fontSize: 18, lineHeight: 20 },
  card: { padding: 16, borderWidth: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardBody: { marginTop: 12 },
  drillBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  drillSheet: { paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1 },
  drillHeader: { fontSize: 17, fontWeight: '600', marginBottom: 8 },
  drillRow: { fontSize: 14, marginBottom: 4 },
  drillFilterButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  drillFilterText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  drillClose: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  tabItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 4,
  },
});
