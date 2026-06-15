import React, { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import { toChartSeries } from '@/render/normalize';
import {
  CHART_HEIGHT,
  DEFAULT_CHART_WIDTH,
  getLinePoints,
  getPlotArea,
  pickAxisLabelIndices,
  pointsToString,
  resolveSeriesColor,
  truncateLabel,
} from '@/render/chartScale';
import type { QueryResult } from '@/api/schemas';

export interface LineChartViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
}

/**
 * Line chart: a <Polyline> through scaled points with a small <Circle> dot at
 * each, a baseline, and truncated x-axis labels. Renders a themed "no data"
 * message when there is no numeric series.
 */
export function LineChartView({ result, vizSettings }: LineChartViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const [width, setWidth] = useState(DEFAULT_CHART_WIDTH);

  const series = toChartSeries(result, vizSettings);

  if (!series || series.values.length === 0) {
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
  const points = getLinePoints(series.values, plot);
  const color = resolveSeriesColor(vizSettings, series.metricName, theme.colors.primary);
  // Thin out the x-axis labels so they don't overlap; points stay one-per-value.
  const labelIndices = pickAxisLabelIndices(points.length);

  return (
    <View style={styles.container} onLayout={onLayout}>
      <Text style={[styles.title, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {series.metricName}
      </Text>
      <Svg width={width} height={CHART_HEIGHT}>
        <Line
          x1={plot.innerLeft}
          y1={plot.innerBottom}
          x2={plot.innerRight}
          y2={plot.innerBottom}
          stroke={theme.colors.border}
          strokeWidth={1}
        />
        {points.length > 1 ? (
          <Polyline
            points={pointsToString(points)}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {points.map((p, i) => (
          <Circle key={`dot-${i}`} cx={p.x} cy={p.y} r={3} fill={color} />
        ))}
        {labelIndices.map((i) => (
          <SvgText
            key={`label-${i}`}
            x={points[i]?.x ?? plot.innerLeft}
            y={plot.innerBottom + 16}
            fontSize={9}
            fill={theme.colors.textMuted}
            textAnchor="middle"
          >
            {truncateLabel(series.labels[i] ?? '')}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8 },
  title: { fontSize: 12, fontWeight: '600', marginBottom: 4, paddingHorizontal: 4 },
  noData: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
});
