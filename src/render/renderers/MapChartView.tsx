import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import { formatValue } from '@/render/normalize';
import { formatNumber as fmtNum } from '@/viz/format';
import { type PointSelectInfo } from '@/viz/drill/pointSelect';
import { TableView } from './TableView';
import {
  detectMapType,
  resolveRegionConfig,
  resolvePinConfig,
  type ResolvedRegionConfig,
  type ResolvedPinConfig,
} from '@/render/maps/detect';
import {
  loadRegion,
  getRegionConfig,
  featureJoinKey,
  featureDisplayName,
  type RegionFeatureCollection,
  type RegionConfig,
} from '@/render/maps/regionData';
import {
  fitProjection,
  geoBounds,
  geometryToPath,
  getRawProjection,
  padBounds,
  pointsBounds,
} from '@/render/maps/projection';
import { NO_DATA_COLOR, legendTitles } from '@/render/maps/colorScale';
import {
  buildChoroplethModel,
  buildPinModel,
  pinRadius,
  type ChoroplethModel,
  type PinModel,
} from '@/render/maps/mapModel';
import type { QueryResult } from '@/api/schemas';

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 260;
const PROJECTION_PAD = 6;

export interface MapChartViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  /** The original card display id (`map` / `state` / `country` / `pin_map`). */
  display?: string;
  /** Map height in px (defaults to {@link DEFAULT_HEIGHT}). */
  height?: number;
  /**
   * Optional drill-through callback. When set, tapping a region/pin reports the
   * selection (label = region or coordinate, points = the metric value) so a
   * dashboard can open an action sheet.
   */
  onPointSelect?: (info: PointSelectInfo) => void;
}

/**
 * Map visualization rendered with `react-native-svg` only (no native map libs).
 *
 * Dispatches on the effective map type:
 *  - REGION → a choropleth: each bundled region polygon filled by the joined
 *    metric on a sequential color scale, a legend with the value buckets, and a
 *    tappable region that reports its name + value.
 *  - PIN → markers projected onto an equirectangular world (with a light country
 *    outline backdrop), optionally sized/colored by a metric; tapping a marker
 *    reports its value.
 *
 * When the settings are missing, the region is unknown, or the type is
 * unsupported (grid/heat), it falls back to {@link TableView} (we always have
 * the rows) under a short note explaining why.
 */
export function MapChartView({
  result,
  vizSettings,
  display,
  height = DEFAULT_HEIGHT,
  onPointSelect,
}: MapChartViewProps): React.ReactElement {
  const { t } = useTranslation();
  const type = useMemo(
    () => detectMapType(display, result.cols, vizSettings),
    [display, result.cols, vizSettings],
  );

  if (type === 'unsupported') {
    return <FallbackTable result={result} note={t('chart.mapUnsupportedType')} />;
  }

  if (type === 'pin') {
    const pin = resolvePinConfig(result.cols, vizSettings);
    if (!pin.ok) {
      return <FallbackTable result={result} note={t('chart.mapNoLatLng')} />;
    }
    return (
      <PinMapView
        result={result}
        config={pin.config}
        height={height}
        onPointSelect={onPointSelect}
      />
    );
  }

  // region
  const region = resolveRegionConfig(display, result.cols, vizSettings);
  if (!region.ok) {
    const note =
      region.error === 'noRegion'
        ? t('chart.mapNoRegion')
        : region.error === 'unknownRegion'
          ? t('chart.mapUnknownRegion')
          : t('chart.mapNoRegionColumns');
    return <FallbackTable result={result} note={note} />;
  }
  const fc = loadRegion(region.config.region);
  const regionCfg = getRegionConfig(region.config.region);
  if (!fc || !regionCfg) {
    return <FallbackTable result={result} note={t('chart.mapUnknownRegion')} />;
  }
  return (
    <ChoroplethMapView
      result={result}
      config={region.config}
      fc={fc}
      regionCfg={regionCfg}
      height={height}
      onPointSelect={onPointSelect}
    />
  );
}

// ---------------------------------------------------------------------------
// Choropleth
// ---------------------------------------------------------------------------

interface ChoroplethProps {
  result: QueryResult;
  config: ResolvedRegionConfig;
  fc: RegionFeatureCollection;
  regionCfg: RegionConfig;
  height: number;
  onPointSelect?: (info: PointSelectInfo) => void;
}

function ChoroplethMapView({
  result,
  config,
  fc,
  regionCfg,
  height,
  onPointSelect,
}: ChoroplethProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const model = useMemo<ChoroplethModel | null>(
    () => buildChoroplethModel(result, config),
    [result, config],
  );

  const project = useMemo(() => {
    const raw = getRawProjection(regionCfg.projection);
    const bounds = padBounds(geoBounds(fc), 0.02);
    return fitProjection(bounds, width, height, PROJECTION_PAD, raw);
  }, [fc, regionCfg.projection, width, height]);

  const onLayout = (e: LayoutChangeEvent): void => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - width) > 1) {
      setWidth(w);
    }
  };

  if (!model) {
    return <FallbackTable result={result} note={t('chart.mapNoRegionColumns')} />;
  }

  const metricCol = model.metricCol;
  const formatMetric = (n: number): string =>
    metricCol ? formatValue(n, metricCol) : safeNumber(n);

  const titles = legendTitles(model.scale.groups, formatMetric);

  const selectName = selectedKey != null ? findFeatureName(fc, regionCfg, selectedKey) : null;
  const selectedValue = selectedKey != null ? model.valuesByKey.get(selectedKey) : undefined;

  const handlePress = (key: string): void => {
    setSelectedKey((prev) => (prev === key ? null : key));
    if (onPointSelect) {
      const value = model.valuesByKey.get(key);
      const name = findFeatureName(fc, regionCfg, key) ?? key;
      const info: PointSelectInfo = {
        index: 0,
        label: name,
        points: metricCol ? [{ name: metricCol.displayName, value: value ?? 0 }] : [],
        dimensionColumnName: config.dimensionName,
      };
      onPointSelect(info);
    }
  };

  return (
    <View style={styles.container} onLayout={onLayout}>
      <Svg width={width} height={height} testID="choropleth-svg">
        {fc.features.map((feature, i) => {
          const key = featureJoinKey(feature, regionCfg);
          const value = model.valuesByKey.get(key);
          const fill = value == null ? NO_DATA_COLOR : model.scale.colorFor(value);
          const d = geometryToPath(feature.geometry, project);
          if (d === '') {
            return null;
          }
          const isSelected = selectedKey === key;
          return (
            <Path
              key={`region-${key}-${i}`}
              testID={`region-${key}`}
              d={d}
              fill={fill}
              fillRule="evenodd"
              stroke={isSelected ? theme.colors.text : '#FFFFFF'}
              strokeWidth={isSelected ? 1.5 : 0.5}
              onPress={() => handlePress(key)}
            />
          );
        })}
      </Svg>
      <ChoroplethLegend titles={titles} colors={model.scale.colors} />
      {selectedKey != null && selectName != null ? (
        <View
          testID="map-tooltip"
          style={[
            styles.tooltip,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          <Text style={[styles.tooltipTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {selectName}
          </Text>
          <Text style={[styles.tooltipRow, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {metricCol ? `${metricCol.displayName}: ` : ''}
            {selectedValue == null ? '—' : formatMetric(selectedValue)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ChoroplethLegend({
  titles,
  colors,
}: {
  titles: string[];
  colors: string[];
}): React.ReactElement | null {
  const theme = useTheme();
  if (titles.length === 0) {
    return null;
  }
  return (
    <View style={styles.legend} testID="map-legend">
      {titles.map((title, i) => (
        <View key={`legend-${i}`} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: colors[i] ?? NO_DATA_COLOR }]} />
          <Text style={[styles.legendLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pin
// ---------------------------------------------------------------------------

interface PinProps {
  result: QueryResult;
  config: ResolvedPinConfig;
  height: number;
  onPointSelect?: (info: PointSelectInfo) => void;
}

function PinMapView({ result, config, height, onPointSelect }: PinProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [selected, setSelected] = useState<number | null>(null);

  const model = useMemo<PinModel | null>(() => buildPinModel(result, config), [result, config]);

  // Light world backdrop behind the markers.
  const backdrop = useMemo(() => loadRegion('world_countries'), []);
  const backdropCfg = useMemo(() => getRegionConfig('world_countries'), []);

  const project = useMemo(() => {
    const pts = model?.points.map((p) => [p.lng, p.lat] as const) ?? [];
    const bounds = padBounds(pointsBounds(pts), 0.1);
    return fitProjection(
      bounds,
      width,
      height,
      PROJECTION_PAD,
      getRawProjection('equirectangular'),
    );
  }, [model, width, height]);

  const onLayout = (e: LayoutChangeEvent): void => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - width) > 1) {
      setWidth(w);
    }
  };

  if (!model) {
    return <FallbackTable result={result} note={t('chart.mapNoLatLng')} />;
  }

  if (model.points.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.noData, { color: theme.colors.textMuted }]}>
          {t('chart.mapNoData')}
        </Text>
      </View>
    );
  }

  const formatMetric = (n: number): string =>
    model.metricCol ? formatValue(n, model.metricCol) : safeNumber(n);

  const handlePress = (i: number): void => {
    setSelected((prev) => (prev === i ? null : i));
    if (onPointSelect) {
      const p = model.points[i];
      if (p) {
        const label = `${safeNumber(p.lat)}, ${safeNumber(p.lng)}`;
        const points =
          model.hasMetric && model.metricCol
            ? [{ name: model.metricCol.displayName, value: p.metric }]
            : [];
        onPointSelect({ index: i, label, points });
      }
    }
  };

  const selectedPoint = selected != null ? model.points[selected] : undefined;

  return (
    <View style={styles.container} onLayout={onLayout}>
      <Svg width={width} height={height} testID="pin-svg">
        {/* World outline backdrop (no data coloring). */}
        {backdrop && backdropCfg
          ? backdrop.features.map((feature, i) => {
              const d = geometryToPath(feature.geometry, project);
              if (d === '') {
                return null;
              }
              return (
                <Path
                  key={`backdrop-${i}`}
                  d={d}
                  fill={theme.colors.border}
                  fillOpacity={0.35}
                  stroke={theme.colors.border}
                  strokeWidth={0.4}
                />
              );
            })
          : null}
        <G>
          {model.points.map((p, i) => {
            const [cx, cy] = project(p.lng, p.lat);
            const r = model.hasMetric ? pinRadius(p.metric, model.metricExtent) : 5;
            return (
              <Circle
                key={`pin-${i}`}
                testID={`pin-${i}`}
                cx={cx}
                cy={cy}
                r={r}
                fill={theme.colors.primary}
                fillOpacity={0.8}
                stroke="#FFFFFF"
                strokeWidth={1}
                onPress={() => handlePress(i)}
              />
            );
          })}
        </G>
      </Svg>
      {model.filtered > 0 ? (
        <Text style={[styles.note, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {t('chart.mapFilteredRows', { count: model.filtered })}
        </Text>
      ) : null}
      {selectedPoint ? (
        <View
          testID="map-tooltip"
          style={[
            styles.tooltip,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          <Text style={[styles.tooltipTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {safeNumber(selectedPoint.lat)}, {safeNumber(selectedPoint.lng)}
          </Text>
          {model.hasMetric && model.metricCol ? (
            <Text style={[styles.tooltipRow, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {model.metricCol.displayName}: {formatMetric(selectedPoint.metric)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function FallbackTable({
  result,
  note,
}: {
  result: QueryResult;
  note: string;
}): React.ReactElement {
  const theme = useTheme();
  return (
    <View>
      <Text style={[styles.note, { color: theme.colors.textMuted }]}>{note}</Text>
      <TableView result={result} />
    </View>
  );
}

/** Find a feature's display name by its lowercased join key. */
function findFeatureName(
  fc: RegionFeatureCollection,
  cfg: RegionConfig,
  key: string,
): string | null {
  const f = fc.features.find((feat) => featureJoinKey(feat, cfg) === key);
  return f ? featureDisplayName(f, cfg) : null;
}

/** Locale-grouped finite number, finite-safe. */
function safeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    return '—';
  }
  try {
    return fmtNum(n);
  } catch {
    return String(n);
  }
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8 },
  note: { fontSize: 12, marginBottom: 8 },
  noData: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, paddingHorizontal: 4, gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendSwatch: { width: 12, height: 12, borderRadius: 2, marginRight: 4 },
  legendLabel: { fontSize: 10 },
  tooltip: {
    position: 'absolute',
    top: 4,
    left: 4,
    minWidth: 120,
    maxWidth: 220,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
  },
  tooltipTitle: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  tooltipRow: { fontSize: 11 },
});
