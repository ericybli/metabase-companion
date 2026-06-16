import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import {
  CHART_HEIGHT,
  DEFAULT_CHART_WIDTH,
  getCategoryBands,
  getGroupedBarGeometryForDomains,
  getLinePointsForDomain,
  getPlotArea,
  pickAxisLabelIndices,
  pointsToString,
  splitLineSegments,
  truncateLabel,
  type DomainSeries,
} from '@/render/chartScale';
import { buildCartesianModel } from '@/viz/model/cartesianModel';
import { buildPointSelectInfo, type PointSelectInfo } from '@/viz/drill/pointSelect';
import { ChartLegend } from './ChartLegend';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import { ChartYAxis } from './ChartYAxis';
import { useHiddenSeries } from './useHiddenSeries';
import type { QueryResult } from '@/api/schemas';

export interface ComboChartViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  /** Chart height in px (defaults to {@link CHART_HEIGHT}). */
  height?: number;
  /**
   * Optional drill-through callback. When provided, tapping a point reports the
   * tapped point (its index, x label, and each visible series' value) IN ADDITION
   * to toggling the in-chart tooltip, so a dashboard can open a richer action
   * sheet. Omitted -> only the tooltip is affected.
   */
  onPointSelect?: (info: PointSelectInfo) => void;
}

/** How a single combo series is drawn. */
type SeriesRenderType = 'bar' | 'line';

/**
 * Resolve a series' render type from `series_settings[name].display`:
 *  - `"line"` (or `"area"`, which we draw as a line) -> a polyline + dots;
 *  - `"bar"` -> a grouped bar;
 *  - anything else / unset -> the sensible combo default, a BAR (so a combo with
 *    no per-series config reads like a plain bar chart, and a line is opt-in).
 *
 * A `display` of `"combo"` itself is not a per-series type — it is the card-level
 * display — so it falls through to the default; mixing happens by giving each
 * series its own `display`.
 */
function seriesRenderType(vizSettings: Record<string, unknown>, name: string): SeriesRenderType {
  const ss = vizSettings['series_settings'];
  if (ss && typeof ss === 'object') {
    const entry = (ss as Record<string, unknown>)[name];
    if (entry && typeof entry === 'object') {
      const display = (entry as Record<string, unknown>)['display'];
      if (display === 'line' || display === 'area') {
        return 'line';
      }
      if (display === 'bar') {
        return 'bar';
      }
    }
  }
  return 'bar';
}

/**
 * Combo chart driven by the dual-axis cartesian model: each series is drawn as a
 * LINE or a BAR according to its `series_settings[name].display` (a mixed chart
 * draws some series as grouped bars and others as polylines + dots), with every
 * series scaled to ITS model-assigned axis (left or right). Bar series share the
 * grouped-bar slots among themselves; line series overlay on top. A LEFT y-axis
 * is always drawn; when the model auto-splits (`hasSplit`) a RIGHT y-axis with
 * its own domain + abbreviated labels is drawn too, so a small-magnitude series
 * stays readable. The legend (multi-series) is tappable: hiding a series
 * recomputes the model from the visible series so the axes rescale. Renders a
 * themed "no data" message when there is nothing to plot.
 */
export function ComboChartView({
  result,
  vizSettings,
  height = CHART_HEIGHT,
  onPointSelect,
}: ComboChartViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const [width, setWidth] = useState(DEFAULT_CHART_WIDTH);
  const { selectedIndex, toggleIndex, clear } = useChartTooltip();

  // Base model (nothing hidden) gives a stable series count for the hook.
  const baseModel = useMemo(
    () => buildCartesianModel(result, vizSettings, {}),
    [result, vizSettings],
  );
  const seriesCount = baseModel?.series.length ?? 0;
  const { hidden, toggle } = useHiddenSeries(seriesCount);

  // Recompute the model from the VISIBLE series so hiding rescales the axes.
  const hiddenSeries = useMemo(
    () => hidden.map((h, i) => (h ? i : -1)).filter((i) => i >= 0),
    [hidden],
  );
  const model = useMemo(
    () => buildCartesianModel(result, vizSettings, { hiddenSeries }) ?? baseModel,
    [result, vizSettings, hiddenSeries, baseModel],
  );

  if (!model || model.series.length === 0 || model.labels.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.noData, { color: theme.colors.textMuted }]}>{t('chart.noData')}</Text>
      </View>
    );
  }

  const onLayout = (e: LayoutChangeEvent): void => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - width) > 1) {
      setWidth(w);
    }
  };

  const plot = getPlotArea(width, height, model.hasSplit);
  const left = model.left ?? { min: 0, max: 1 };
  const right = model.right;

  // Per-series render type + the axis domain each series scales against.
  const renderTypes = model.series.map((s) => seriesRenderType(vizSettings, s.name));
  const domainFor = (axis: 'left' | 'right'): { min: number; max: number } =>
    axis === 'right' && right ? right : left;

  // --- Bars: only the VISIBLE bar series occupy grouped-bar slots, so a 1-bar +
  // 1-line combo draws a single (not half-width) bar per band. Map each bar slot
  // back to its model series index for color + axis lookups.
  const barSlotIndices = model.series
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => !s.hidden && renderTypes[i] === 'bar')
    .map(({ i }) => i);
  const barDomainSeries: DomainSeries[] = barSlotIndices.map((i) => {
    const s = model.series[i]!;
    const domain = domainFor(s.axis);
    return { values: s.values, min: domain.min, max: domain.max };
  });
  const bars = getGroupedBarGeometryForDomains(barDomainSeries, model.labels.length, plot);

  // Thin out the x-axis labels so they don't overlap.
  const labelIndices = pickAxisLabelIndices(model.labels.length);
  const multi = model.series.length > 1;
  // One full-height transparent touch band per label for tap-for-value.
  const touchBands = getCategoryBands(model.labels.length, plot);
  const anchorX = selectedIndex !== null ? (touchBands[selectedIndex]?.centerX ?? 0) : 0;

  // A tap toggles the in-chart tooltip AND (when wired) reports the point for
  // the dashboard drill action sheet.
  const onTouch = (index: number): void => {
    toggleIndex(index);
    if (onPointSelect) {
      const info = buildPointSelectInfo(index, model.labels, model.series);
      if (info) {
        onPointSelect(info);
      }
    }
  };

  return (
    <View style={styles.container} onLayout={onLayout}>
      {!multi ? (
        <Text style={[styles.title, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {model.series[0]?.name ?? ''}
        </Text>
      ) : null}
      {multi ? (
        <ChartLegend
          names={model.series.map((s) => s.name)}
          colorAt={(i) => model.series[i]?.color ?? theme.colors.primary}
          hidden={hidden}
          onToggle={toggle}
        />
      ) : null}
      <View>
        <Svg width={width} height={height}>
          {/* Background tap target — clears the tooltip when tapping empty space. */}
          <Rect
            x={plot.innerLeft}
            y={plot.innerTop}
            width={plot.innerWidth}
            height={plot.innerBottom - plot.innerTop}
            fill="transparent"
            onPress={clear}
          />
          <ChartYAxis
            min={left.min}
            max={left.max}
            plot={plot}
            gridColor={theme.colors.border}
            labelColor={theme.colors.textMuted}
            side="left"
          />
          {model.hasSplit && right ? (
            <ChartYAxis
              min={right.min}
              max={right.max}
              plot={plot}
              gridColor={theme.colors.border}
              labelColor={theme.colors.textMuted}
              side="right"
            />
          ) : null}
          {/* Bars first, so lines + dots overlay on top of them. */}
          {bars.map((bar, i) => {
            const seriesIndex = barSlotIndices[bar.seriesIndex];
            const color =
              seriesIndex !== undefined
                ? (model.series[seriesIndex]?.color ?? theme.colors.primary)
                : theme.colors.primary;
            return (
              <Rect
                key={`bar-${i}`}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx={2}
                fill={color}
              />
            );
          })}
          {model.series.map((s, si) => {
            if (s.hidden || renderTypes[si] !== 'line') {
              return null;
            }
            const domain = domainFor(s.axis);
            const points = getLinePointsForDomain(s.values, plot, domain.min, domain.max);
            const segments = splitLineSegments(points);
            return (
              <React.Fragment key={`line-${si}`}>
                {segments.map((seg, segi) =>
                  seg.length > 1 ? (
                    <Polyline
                      key={`seg-${si}-${segi}`}
                      points={pointsToString(seg)}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ) : null,
                )}
                {segments.flatMap((seg, segi) =>
                  seg.map((p, i) => (
                    <Circle key={`dot-${si}-${segi}-${i}`} cx={p.x} cy={p.y} r={3} fill={s.color} />
                  )),
                )}
              </React.Fragment>
            );
          })}
          {labelIndices.map((i) => (
            <SvgText
              key={`label-${i}`}
              x={touchBands[i]?.centerX ?? plot.innerLeft}
              y={plot.innerBottom + 16}
              fontSize={9}
              fill={theme.colors.textMuted}
              textAnchor="middle"
            >
              {truncateLabel(model.labels[i] ?? '')}
            </SvgText>
          ))}
          {touchBands.map((band) => (
            <Rect
              key={`touch-${band.index}`}
              testID={`chart-touch-${band.index}`}
              accessibilityLabel={model.labels[band.index] ?? String(band.index)}
              x={band.x}
              y={plot.innerTop}
              width={band.width}
              height={plot.innerBottom - plot.innerTop}
              fill="transparent"
              onPress={() => onTouch(band.index)}
            />
          ))}
        </Svg>
        <ChartTooltip
          labels={model.labels}
          series={model.series}
          selectedIndex={selectedIndex}
          anchorX={anchorX}
          width={width}
          hidden={hidden}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8 },
  title: { fontSize: 12, fontWeight: '600', marginBottom: 4, paddingHorizontal: 4 },
  noData: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
});
