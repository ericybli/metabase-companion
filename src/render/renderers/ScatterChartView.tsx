import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import {
  abbreviateNumber,
  CHART_HEIGHT,
  DEFAULT_CHART_WIDTH,
  getPlotArea,
  valueToXRange,
  valueToYRange,
  yAxisTicks,
} from '@/render/chartScale';
import { formatNumber as fmtNum } from '@/viz/format';
import { bubbleRadius, buildScatterModel } from '@/viz/model/scatterModel';
import { type PointSelectInfo } from '@/viz/drill/pointSelect';
import { ChartLegend } from './ChartLegend';
import { ChartYAxis } from './ChartYAxis';
import { useHiddenSeries } from './useHiddenSeries';
import type { QueryResult } from '@/api/schemas';

export interface ScatterChartViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  /** Chart height in px (defaults to {@link CHART_HEIGHT}). */
  height?: number;
  /**
   * Optional drill-through callback. When provided, tapping a point reports the
   * tapped point (its x value as the label, plus the series' y and any bubble
   * size as values) IN ADDITION to toggling the in-chart tooltip, so a dashboard
   * can open a richer action sheet. Omitted -> only the tooltip is affected.
   */
  onPointSelect?: (info: PointSelectInfo) => void;
}

/** A point currently selected for the tooltip. */
interface SelectedPoint {
  seriesIndex: number;
  pointIndex: number;
}

/**
 * Scatter (x/y) plot. Each row becomes a <Circle> positioned by its x value
 * (the dimension / first column) and y value (a metric) on two NUMERIC axes.
 * When a bubble-size column is configured (`scatter.bubble`) each point's radius
 * scales between a min and max from that column's value. Multiple y metrics draw
 * as separate, tappable-legend series in palette colors. Tapping a point shows a
 * tooltip with its (x, y) (and size when present). A LEFT y-axis with gridlines
 * and a numeric x-axis with ticks frame the plot. Renders a themed "no data"
 * message when there is nothing to plot.
 */
export function ScatterChartView({
  result,
  vizSettings,
  height = CHART_HEIGHT,
  onPointSelect,
}: ScatterChartViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const [width, setWidth] = useState(DEFAULT_CHART_WIDTH);
  const [selected, setSelected] = useState<SelectedPoint | null>(null);

  const model = useMemo(() => buildScatterModel(result, vizSettings), [result, vizSettings]);
  const seriesCount = model?.series.length ?? 0;
  const { hidden, toggle } = useHiddenSeries(seriesCount);

  if (!model || model.series.length === 0) {
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

  const plot = getPlotArea(width, height, false);
  const { x, y } = model;
  const xTicks = yAxisTicks(x.min, x.max);
  const multi = model.series.length > 1;

  const togglePoint = (seriesIndex: number, pointIndex: number): void => {
    setSelected((prev) =>
      prev && prev.seriesIndex === seriesIndex && prev.pointIndex === pointIndex
        ? null
        : { seriesIndex, pointIndex },
    );
    if (onPointSelect) {
      const s = model.series[seriesIndex];
      const p = s?.points[pointIndex];
      if (s && p) {
        // Scatter has no categorical x-axis: the tapped point's x value IS the
        // "label", and the series y (plus any bubble size) are the values.
        const points = [{ name: s.name, value: p.y }];
        if (p.size !== null) {
          points.push({ name: t('chart.scatterSize'), value: p.size });
        }
        const info: PointSelectInfo = {
          index: pointIndex,
          label: formatNumber(p.x),
          points,
          dimensionColumnName: model.dimension.name,
        };
        if (model.dimension.fieldId != null) {
          info.dimensionFieldId = model.dimension.fieldId;
        }
        onPointSelect(info);
      }
    }
  };

  const selectedSeries = selected ? model.series[selected.seriesIndex] : undefined;
  const selectedPoint = selectedSeries ? selectedSeries.points[selected!.pointIndex] : undefined;

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
            min={y.min}
            max={y.max}
            plot={plot}
            gridColor={theme.colors.border}
            labelColor={theme.colors.textMuted}
            side="left"
          />
          {/* Numeric x-axis: a baseline + a tick label under each tick value. */}
          <G>
            <Line
              x1={plot.innerLeft}
              y1={plot.innerBottom}
              x2={plot.innerRight}
              y2={plot.innerBottom}
              stroke={theme.colors.border}
              strokeWidth={1}
              strokeOpacity={0.5}
            />
            {xTicks.map((value, i) => {
              const tx = valueToXRange(value, x.min, x.max, plot);
              return (
                <SvgText
                  key={`xtick-${i}`}
                  x={tx}
                  y={plot.innerBottom + 14}
                  fontSize={9}
                  fill={theme.colors.textMuted}
                  textAnchor="middle"
                >
                  {abbreviateNumber(value)}
                </SvgText>
              );
            })}
          </G>
          {model.series.map((s, si) => {
            if (hidden[si]) {
              return null;
            }
            return (
              <G key={`series-${si}`}>
                {s.points.map((p, pi) => (
                  <Circle
                    key={`pt-${si}-${pi}`}
                    testID={`scatter-point-${si}-${pi}`}
                    accessibilityLabel={`${s.name} x: ${formatNumber(p.x)} y: ${formatNumber(p.y)}`}
                    cx={valueToXRange(p.x, x.min, x.max, plot)}
                    cy={valueToYRange(p.y, y.min, y.max, plot)}
                    r={bubbleRadius(p.size, model.sizeExtent)}
                    fill={s.color}
                    fillOpacity={0.7}
                    stroke={s.color}
                    strokeWidth={1}
                    onPress={() => togglePoint(si, pi)}
                  />
                ))}
              </G>
            );
          })}
        </Svg>
        {selected && selectedSeries && selectedPoint ? (
          <View
            testID="chart-tooltip"
            pointerEvents="none"
            style={[
              styles.tooltip,
              {
                left: clampLeft(valueToXRange(selectedPoint.x, x.min, x.max, plot), width),
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.sm,
              },
            ]}
          >
            <Text style={[styles.tooltipTitle, { color: theme.colors.text }]} numberOfLines={1}>
              {selectedSeries.name}
            </Text>
            <Text style={[styles.tooltipRow, { color: theme.colors.textMuted }]} numberOfLines={1}>
              x: {formatNumber(selectedPoint.x)}
            </Text>
            <Text style={[styles.tooltipRow, { color: theme.colors.textMuted }]} numberOfLines={1}>
              y: {formatNumber(selectedPoint.y)}
            </Text>
            {selectedPoint.size !== null ? (
              <Text
                style={[styles.tooltipRow, { color: theme.colors.textMuted }]}
                numberOfLines={1}
              >
                size: {formatNumber(selectedPoint.size)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const TOOLTIP_WIDTH = 120;

/** Keep the tooltip box within the chart bounds, centered on the point. */
function clampLeft(anchorX: number, width: number): number {
  const half = TOOLTIP_WIDTH / 2;
  return Math.max(0, Math.min(width - TOOLTIP_WIDTH, anchorX - half));
}

/** Friendly number for the tooltip (locale grouping, finite-safe). */
function formatNumber(n: number): string {
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
  title: { fontSize: 12, fontWeight: '600', marginBottom: 4, paddingHorizontal: 4 },
  noData: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  tooltip: {
    position: 'absolute',
    top: 4,
    width: TOOLTIP_WIDTH,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
  },
  tooltipTitle: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  tooltipRow: { fontSize: 11 },
});
