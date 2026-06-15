import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import {
  CHART_HEIGHT,
  DEFAULT_CHART_WIDTH,
  getCategoryBands,
  getGroupedBarGeometryForDomains,
  getPlotArea,
  pickAxisLabelIndices,
  truncateLabel,
  type DomainSeries,
} from '@/render/chartScale';
import { buildCartesianModel } from '@/viz/model/cartesianModel';
import { ChartLegend } from './ChartLegend';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import { ChartYAxis } from './ChartYAxis';
import { useHiddenSeries } from './useHiddenSeries';
import type { QueryResult } from '@/api/schemas';

export interface BarChartViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  /** Chart height in px (defaults to {@link CHART_HEIGHT}). */
  height?: number;
}

/**
 * Bar chart driven by the dual-axis cartesian model: grouped bars — for each
 * label, one <Rect> per VISIBLE series side-by-side, in its model-assigned
 * palette color and scaled to ITS axis (left or right). A LEFT y-axis is always
 * drawn; when the model auto-splits (`hasSplit`) a RIGHT y-axis with its own
 * domain + abbreviated labels is drawn too, so a small-magnitude series is
 * readable. The legend (multi-series) is tappable: hiding a series recomputes
 * the model from the visible series so the axes rescale. Renders a themed "no
 * data" message when there is nothing to plot.
 */
export function BarChartView({
  result,
  vizSettings,
  height = CHART_HEIGHT,
}: BarChartViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const [width, setWidth] = useState(DEFAULT_CHART_WIDTH);
  const { selectedIndex, toggleIndex } = useChartTooltip();

  const baseModel = useMemo(
    () => buildCartesianModel(result, vizSettings, {}),
    [result, vizSettings],
  );
  const seriesCount = baseModel?.series.length ?? 0;
  const { hidden, toggle } = useHiddenSeries(seriesCount);

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

  // Per-series geometry: each series scales to its assigned axis. Hidden series
  // collapse to an empty band (no values) so visible bars keep their position.
  const domainSeries: DomainSeries[] = model.series.map((s) => {
    const domain = s.axis === 'right' && right ? right : left;
    return {
      values: s.hidden ? [] : s.values,
      min: domain.min,
      max: domain.max,
    };
  });
  const bars = getGroupedBarGeometryForDomains(domainSeries, model.labels.length, plot).filter(
    (bar) => !model.series[bar.seriesIndex]?.hidden,
  );

  // Thin out the x-axis labels so they don't overlap; bars stay one-per-value.
  const labelIndices = pickAxisLabelIndices(model.labels.length);
  // First bar per label band gives us the band center for label placement.
  const bandCenters = new Map<number, number>();
  for (const bar of bars) {
    if (!bandCenters.has(bar.labelIndex)) {
      bandCenters.set(bar.labelIndex, bar.centerX);
    }
  }
  const multi = model.series.length > 1;
  // One full-height transparent touch band per label for tap-for-value.
  const touchBands = getCategoryBands(model.labels.length, plot);
  const anchorX = selectedIndex !== null ? (touchBands[selectedIndex]?.centerX ?? 0) : 0;

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
          {bars.map((bar, i) => (
            <Rect
              key={`bar-${i}`}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx={2}
              fill={model.series[bar.seriesIndex]?.color ?? theme.colors.primary}
            />
          ))}
          {labelIndices.map((i) => (
            <SvgText
              key={`label-${i}`}
              x={bandCenters.get(i) ?? touchBands[i]?.centerX ?? plot.innerLeft}
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
              x={band.x}
              y={plot.innerTop}
              width={band.width}
              height={plot.innerBottom - plot.innerTop}
              fill="transparent"
              onPress={() => toggleIndex(band.index)}
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
