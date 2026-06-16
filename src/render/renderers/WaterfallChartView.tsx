import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import {
  CHART_HEIGHT,
  DEFAULT_CHART_WIDTH,
  getPlotArea,
  pickAxisLabelIndices,
  truncateLabel,
  valueToYRange,
} from '@/render/chartScale';
import { formatNumber as fmtNum } from '@/viz/format';
import {
  buildWaterfallModel,
  waterfallColors,
  type WaterfallStep,
} from '@/viz/model/waterfallModel';
import { buildPointSelectInfo, type PointSelectInfo } from '@/viz/drill/pointSelect';
import { ChartYAxis } from './ChartYAxis';
import type { QueryResult } from '@/api/schemas';

export interface WaterfallChartViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  /** Chart height in px (defaults to {@link CHART_HEIGHT}). */
  height?: number;
  /**
   * Optional drill-through callback. When provided, tapping a bar reports the
   * tapped step (its index, category label, and the measure's value at that
   * step) IN ADDITION to toggling the in-chart tooltip, so a dashboard can open
   * a richer action sheet. Omitted -> only the tooltip is affected.
   */
  onPointSelect?: (info: PointSelectInfo) => void;
}

/**
 * Waterfall chart: a SINGLE measure stepped across categories as a running
 * total. Each step is a <Rect> that FLOATS between the previous cumulative total
 * and the new one — a rise (increase) or a fall (decrease) drawn in distinct
 * colors (from `waterfall.increase_color` / `waterfall.decrease_color`, with
 * sensible defaults). When `waterfall.show_total` is on (default), a final TOTAL
 * bar floats from 0 up to the grand total in `waterfall.total_color`. A LEFT
 * y-axis with gridlines frames the bars; x labels are thinned to avoid overlap.
 * Tapping a bar shows its step delta + cumulative. Renders a themed "no data"
 * message when there is nothing to plot.
 */
export function WaterfallChartView({
  result,
  vizSettings,
  height = CHART_HEIGHT,
  onPointSelect,
}: WaterfallChartViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const [width, setWidth] = useState(DEFAULT_CHART_WIDTH);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const model = useMemo(() => buildWaterfallModel(result, vizSettings), [result, vizSettings]);
  const colors = useMemo(() => waterfallColors(vizSettings), [vizSettings]);

  if (!model || model.steps.length === 0) {
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
  const { domain, steps } = model;
  const count = steps.length;
  const bandWidth = plot.innerWidth / count;
  const barWidth = Math.max(1, bandWidth * 0.7);
  const labelIndices = pickAxisLabelIndices(count);

  const colorFor = (step: WaterfallStep): string => {
    if (step.kind === 'total') {
      return colors.total;
    }
    return step.kind === 'decrease' ? colors.decrease : colors.increase;
  };

  const bars = steps.map((step, i) => {
    const bandStart = plot.innerLeft + i * bandWidth;
    const centerX = bandStart + bandWidth / 2;
    const yStart = valueToYRange(step.start, domain.min, domain.max, plot);
    const yEnd = valueToYRange(step.end, domain.min, domain.max, plot);
    const top = Math.min(yStart, yEnd);
    // Keep a minimum 1px height so a zero-delta step still shows a thin marker.
    const barHeight = Math.max(1, Math.abs(yEnd - yStart));
    return { step, x: centerX - barWidth / 2, y: top, height: barHeight, centerX, index: i };
  });

  // A tap toggles the in-chart tooltip AND (when wired) reports the step for the
  // dashboard drill action sheet. The waterfall is a single measure stepped
  // across categories, so we report one series (the measure) carrying each step's
  // signed value, keyed by the step labels.
  const toggle = (i: number): void => {
    setSelectedIndex((prev) => (prev === i ? null : i));
    if (onPointSelect) {
      const labels = steps.map((s) => s.label);
      const values = steps.map((s) => s.value);
      const info = buildPointSelectInfo(
        i,
        labels,
        [{ name: model.measureName, values }],
        model.dimension,
      );
      if (info) {
        onPointSelect(info);
      }
    }
  };

  const selected = selectedIndex !== null ? bars[selectedIndex] : undefined;

  return (
    <View style={styles.container} onLayout={onLayout}>
      <Text style={[styles.title, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {model.measureName}
      </Text>
      <View>
        <Svg width={width} height={height}>
          <ChartYAxis
            min={domain.min}
            max={domain.max}
            plot={plot}
            gridColor={theme.colors.border}
            labelColor={theme.colors.textMuted}
            side="left"
          />
          {bars.map((bar) => (
            <Rect
              key={`wf-${bar.index}`}
              testID={`waterfall-bar-${bar.index}`}
              x={bar.x}
              y={bar.y}
              width={barWidth}
              height={bar.height}
              rx={1}
              fill={colorFor(bar.step)}
            />
          ))}
          {labelIndices.map((i) => (
            <SvgText
              key={`label-${i}`}
              x={bars[i]?.centerX ?? plot.innerLeft}
              y={plot.innerBottom + 16}
              fontSize={9}
              fill={theme.colors.textMuted}
              textAnchor="middle"
            >
              {truncateLabel(steps[i]?.label ?? '')}
            </SvgText>
          ))}
          {/* One transparent full-height touch band per step for tap-for-value. */}
          {bars.map((bar) => (
            <Rect
              key={`touch-${bar.index}`}
              testID={`chart-touch-${bar.index}`}
              accessibilityLabel={bar.step.label}
              x={plot.innerLeft + bar.index * bandWidth}
              y={plot.innerTop}
              width={bandWidth}
              height={plot.innerBottom - plot.innerTop}
              fill="transparent"
              onPress={() => toggle(bar.index)}
            />
          ))}
        </Svg>
        {selected ? (
          <View
            testID="chart-tooltip"
            pointerEvents="none"
            style={[
              styles.tooltip,
              {
                left: clampLeft(selected.centerX, width),
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.sm,
              },
            ]}
          >
            <Text style={[styles.tooltipTitle, { color: theme.colors.text }]} numberOfLines={1}>
              {selected.step.label}
            </Text>
            <Text style={[styles.tooltipRow, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {selected.step.kind === 'total'
                ? t('chart.waterfallTotal')
                : t('chart.waterfallStep')}
              : {formatNumber(selected.step.value)}
            </Text>
            {selected.step.kind !== 'total' ? (
              <Text
                style={[styles.tooltipRow, { color: theme.colors.textMuted }]}
                numberOfLines={1}
              >
                {t('chart.waterfallCumulative')}: {formatNumber(selected.step.cumulative)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const TOOLTIP_WIDTH = 140;

/** Keep the tooltip box within the chart bounds, centered on the bar. */
function clampLeft(anchorX: number, width: number): number {
  const half = TOOLTIP_WIDTH / 2;
  return Math.max(0, Math.min(width - TOOLTIP_WIDTH, anchorX - half));
}

/** Friendly signed number for the tooltip (locale grouping, finite-safe). */
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
