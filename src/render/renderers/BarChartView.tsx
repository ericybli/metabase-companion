import React, { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import { toChartData } from '@/render/normalize';
import {
  CHART_HEIGHT,
  DEFAULT_CHART_WIDTH,
  domainMaxMulti,
  getCategoryBands,
  getGroupedBarGeometry,
  getPlotArea,
  paletteColor,
  pickAxisLabelIndices,
  truncateLabel,
} from '@/render/chartScale';
import { ChartLegend } from './ChartLegend';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import type { QueryResult } from '@/api/schemas';

export interface BarChartViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
}

/**
 * Bar chart: grouped bars — for each label, one <Rect> per series side-by-side,
 * each in its own palette color and sharing a global y-axis max. A legend is
 * drawn when there is more than one series. Renders a themed "no data" message
 * when there is no numeric series.
 */
export function BarChartView({ result, vizSettings }: BarChartViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const [width, setWidth] = useState(DEFAULT_CHART_WIDTH);
  const { selectedIndex, toggleIndex } = useChartTooltip();

  const data = toChartData(result, vizSettings);

  if (!data || data.series.length === 0 || data.labels.length === 0) {
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

  const plot = getPlotArea(width, CHART_HEIGHT);
  const seriesValues = data.series.map((s) => s.values);
  const max = domainMaxMulti(seriesValues);
  const bars = getGroupedBarGeometry(seriesValues, data.labels.length, plot, max);
  // Thin out the x-axis labels so they don't overlap; bars stay one-per-value.
  const labelIndices = pickAxisLabelIndices(data.labels.length);
  // First bar per label band gives us the band center for label placement.
  const bandCenters = new Map<number, number>();
  for (const bar of bars) {
    if (!bandCenters.has(bar.labelIndex)) {
      bandCenters.set(bar.labelIndex, bar.centerX);
    }
  }
  const multi = data.series.length > 1;
  // One full-height transparent touch band per label for tap-for-value.
  const touchBands = getCategoryBands(data.labels.length, plot);
  const anchorX = selectedIndex !== null ? (touchBands[selectedIndex]?.centerX ?? 0) : 0;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {!multi ? (
        <Text style={[styles.title, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {data.series[0]?.name ?? ''}
        </Text>
      ) : null}
      {multi ? <ChartLegend names={data.series.map((s) => s.name)} colorAt={paletteColor} /> : null}
      <View>
        <Svg width={width} height={CHART_HEIGHT}>
          <Line
            x1={plot.innerLeft}
            y1={plot.innerBottom}
            x2={plot.innerRight}
            y2={plot.innerBottom}
            stroke={theme.colors.border}
            strokeWidth={1}
          />
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
          {labelIndices.map((i) => (
            <SvgText
              key={`label-${i}`}
              x={bandCenters.get(i) ?? plot.innerLeft}
              y={plot.innerBottom + 16}
              fontSize={9}
              fill={theme.colors.textMuted}
              textAnchor="middle"
            >
              {truncateLabel(data.labels[i] ?? '')}
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
        <ChartTooltip data={data} selectedIndex={selectedIndex} anchorX={anchorX} width={width} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8 },
  title: { fontSize: 12, fontWeight: '600', marginBottom: 4, paddingHorizontal: 4 },
  noData: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
});
