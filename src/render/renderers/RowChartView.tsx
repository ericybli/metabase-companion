import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import {
  abbreviateNumber,
  CHART_HEIGHT,
  DEFAULT_CHART_WIDTH,
  getRowBands,
  getRowBarGeometry,
  paletteColor,
  truncateLabel,
  yAxisTicks,
  type PlotArea,
} from '@/render/chartScale';
import { toChartData } from '@/render/normalize';
import { buildPointSelectInfo, type PointSelectInfo } from '@/viz/drill/pointSelect';
import { ChartLegend } from './ChartLegend';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import { useHiddenSeries } from './useHiddenSeries';
import type { QueryResult } from '@/api/schemas';

export interface RowChartViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  /** Chart height in px (defaults to {@link CHART_HEIGHT}). */
  height?: number;
  /**
   * Optional drill-through callback. When provided, tapping a row band reports
   * the tapped point (its index, category label, and each visible series' value)
   * IN ADDITION to toggling the in-chart tooltip, so a dashboard can open a
   * richer action sheet. Omitted -> only the tooltip is affected.
   */
  onPointSelect?: (info: PointSelectInfo) => void;
}

/** Inner padding (px) for the row chart: wider left gutter for category labels. */
const ROW_PADDING = {
  top: 8,
  right: 36, // room for the value data label past the longest bar
  bottom: 24, // room for the value-axis tick labels
  left: 72, // room for the category labels down the side
} as const;

/** Plot rectangle for a row chart (wider left/bottom gutters than the cartesian one). */
function getRowPlotArea(width: number, height: number): PlotArea {
  const safeWidth = width > 0 ? width : DEFAULT_CHART_WIDTH;
  const safeHeight = height > 0 ? height : CHART_HEIGHT;
  const innerLeft = ROW_PADDING.left;
  const innerRight = Math.max(innerLeft, safeWidth - ROW_PADDING.right);
  const innerTop = ROW_PADDING.top;
  const innerBottom = Math.max(innerTop, safeHeight - ROW_PADDING.bottom);
  return {
    width: safeWidth,
    height: safeHeight,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    innerWidth: innerRight - innerLeft,
    innerHeight: innerBottom - innerTop,
  };
}

/**
 * Value domain [min, max] for the horizontal value axis: 0-anchored by default,
 * extended down to the smallest negative value when any series dips below 0, and
 * up to the largest value. Falls back to [0, 1] when there is no positive data so
 * the axis is drawable. Hidden series are excluded.
 */
function valueDomain(series: readonly { values: readonly number[]; hidden: boolean }[]): {
  min: number;
  max: number;
} {
  let min = 0;
  let max = 0;
  for (const s of series) {
    if (s.hidden) {
      continue;
    }
    for (const v of s.values) {
      if (!Number.isFinite(v)) {
        continue;
      }
      if (v < min) {
        min = v;
      }
      if (v > max) {
        max = v;
      }
    }
  }
  if (max <= min) {
    max = min + 1;
  }
  return { min, max };
}

/**
 * Row chart: a HORIZONTAL bar chart. Category labels run down the y-axis (one
 * row per category) and bars grow left-to-right along a shared horizontal value
 * axis (with 0-anchored ticks across the bottom). Each bar is annotated with its
 * value as a data label at its end. Multiple metrics render as grouped bars
 * stacked within each category row, each in its palette color, with a tappable
 * legend (hiding a series rescales the value axis). Renders a themed "no data"
 * message when there is nothing to plot.
 */
export function RowChartView({
  result,
  vizSettings,
  height = CHART_HEIGHT,
  onPointSelect,
}: RowChartViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const [width, setWidth] = useState(DEFAULT_CHART_WIDTH);
  const { selectedIndex, toggleIndex } = useChartTooltip();

  const chart = useMemo(() => toChartData(result, vizSettings), [result, vizSettings]);
  const seriesCount = chart?.series.length ?? 0;
  const { hidden, toggle } = useHiddenSeries(seriesCount);

  if (!chart || chart.series.length === 0 || chart.labels.length === 0) {
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

  const plot = getRowPlotArea(width, height);
  const labels = chart.labels;
  const labelCount = labels.length;
  const multi = chart.series.length > 1;

  // Value domain over the VISIBLE series, so hiding a big series rescales.
  const domain = valueDomain(
    chart.series.map((s, i) => ({ values: s.values, hidden: hidden[i] ?? false })),
  );

  // Bar geometry: hidden series collapse to empty so visible bars keep position.
  const seriesValues = chart.series.map((s, i) => ((hidden[i] ?? false) ? [] : s.values));
  const allBars = getRowBarGeometry(seriesValues, labelCount, plot, domain.min, domain.max);
  const bars = allBars.filter((bar) => !(hidden[bar.seriesIndex] ?? false));

  // Category row bands (one per label) for labels + tap targets.
  const rowBands = getRowBands(labelCount, plot);
  const anchorX = plot.innerLeft + plot.innerWidth / 2;

  // Value-axis ticks across the bottom.
  const ticks = yAxisTicks(domain.min, domain.max);
  const valueToX = (v: number): number => {
    const span = domain.max - domain.min;
    const safeSpan = span !== 0 ? span : 1;
    return plot.innerLeft + ((v - domain.min) / safeSpan) * plot.innerWidth;
  };

  // Tooltip reads number|null per series (chart values are already numbers).
  const tooltipSeries = chart.series.map((s, i) => ({
    name: s.name,
    values: (hidden[i] ?? false) ? [] : s.values,
  }));

  // A tap toggles the in-chart tooltip AND (when wired) reports the point for
  // the dashboard drill action sheet.
  const onTouch = (index: number): void => {
    toggleIndex(index);
    if (onPointSelect) {
      const pointSeries = chart.series.map((s, i) => ({
        name: s.name,
        values: s.values,
        hidden: hidden[i] ?? false,
      }));
      const info = buildPointSelectInfo(index, labels, pointSeries);
      if (info) {
        onPointSelect(info);
      }
    }
  };

  return (
    <View style={styles.container} onLayout={onLayout}>
      {!multi ? (
        <Text style={[styles.title, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {chart.series[0]?.name ?? ''}
        </Text>
      ) : null}
      {multi ? (
        <ChartLegend
          names={chart.series.map((s) => s.name)}
          colorAt={(i) => paletteColor(i)}
          hidden={hidden}
          onToggle={toggle}
        />
      ) : null}
      <View>
        <Svg width={width} height={height}>
          {/* Vertical value-axis gridlines + tick labels along the bottom. */}
          {ticks.map((value, i) => {
            const x = valueToX(value);
            return (
              <React.Fragment key={`vtick-${i}`}>
                <Line
                  x1={x}
                  y1={plot.innerTop}
                  x2={x}
                  y2={plot.innerBottom}
                  stroke={theme.colors.border}
                  strokeWidth={1}
                  strokeOpacity={0.5}
                />
                <SvgText
                  x={x}
                  y={plot.innerBottom + 14}
                  fontSize={9}
                  fill={theme.colors.textMuted}
                  textAnchor="middle"
                >
                  {abbreviateNumber(value)}
                </SvgText>
              </React.Fragment>
            );
          })}
          {/* Category labels down the left side, centered on each row band. */}
          {rowBands.map((band) => (
            <SvgText
              key={`cat-${band.index}`}
              x={plot.innerLeft - 6}
              y={band.centerY + 3}
              fontSize={9}
              fill={theme.colors.textMuted}
              textAnchor="end"
            >
              {truncateLabel(labels[band.index] ?? '', 10)}
            </SvgText>
          ))}
          {/* Horizontal bars. */}
          {bars.map((bar, i) => (
            <Rect
              key={`bar-${i}`}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx={2}
              fill={paletteColor(bar.seriesIndex)}
            />
          ))}
          {/* Value data labels at the end of each bar. */}
          {bars.map((bar, i) => {
            const raw = chart.series[bar.seriesIndex]?.values[bar.labelIndex];
            if (typeof raw !== 'number' || !Number.isFinite(raw)) {
              return null;
            }
            return (
              <SvgText
                key={`val-${i}`}
                x={bar.x + bar.width + 3}
                y={bar.centerY + 3}
                fontSize={9}
                fill={theme.colors.text}
                textAnchor="start"
              >
                {abbreviateNumber(raw)}
              </SvgText>
            );
          })}
          {/* One full-width transparent touch band per category for tap-for-value. */}
          {rowBands.map((band) => (
            <Rect
              key={`touch-${band.index}`}
              testID={`chart-touch-${band.index}`}
              x={plot.innerLeft}
              y={band.y}
              width={plot.innerWidth}
              height={band.height}
              fill="transparent"
              onPress={() => onTouch(band.index)}
            />
          ))}
        </Svg>
        <ChartTooltip
          labels={labels}
          series={tooltipSeries}
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
