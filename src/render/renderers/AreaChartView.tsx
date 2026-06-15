import React, { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Line, Path, Polyline, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import { toChartData } from '@/render/normalize';
import {
  buildAreaPath,
  CHART_HEIGHT,
  DEFAULT_CHART_WIDTH,
  domainMaxMulti,
  getLinePointsWithMax,
  getPlotArea,
  paletteColor,
  pickAxisLabelIndices,
  pointsToString,
  truncateLabel,
} from '@/render/chartScale';
import { ChartLegend } from './ChartLegend';
import type { QueryResult } from '@/api/schemas';

export interface AreaChartViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
}

/**
 * Area chart: one semi-transparent filled <Path> (down to the baseline) per
 * series, overlaid, plus the line and dots — each in its own palette color and
 * sharing a global y-axis max. A legend is drawn when there is more than one
 * series. Renders a themed "no data" message when there is no numeric series.
 */
export function AreaChartView({ result, vizSettings }: AreaChartViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const [width, setWidth] = useState(DEFAULT_CHART_WIDTH);

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
  const max = domainMaxMulti(data.series.map((s) => s.values));
  const seriesPoints = data.series.map((s) => getLinePointsWithMax(s.values, plot, max));
  // Thin out the x-axis labels so they don't overlap; points stay one-per-value.
  const labelIndices = pickAxisLabelIndices(data.labels.length);
  const multi = data.series.length > 1;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {!multi ? (
        <Text style={[styles.title, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {data.series[0]?.name ?? ''}
        </Text>
      ) : null}
      {multi ? <ChartLegend names={data.series.map((s) => s.name)} colorAt={paletteColor} /> : null}
      <Svg width={width} height={CHART_HEIGHT}>
        <Line
          x1={plot.innerLeft}
          y1={plot.innerBottom}
          x2={plot.innerRight}
          y2={plot.innerBottom}
          stroke={theme.colors.border}
          strokeWidth={1}
        />
        {seriesPoints.map((points, si) => {
          const color = paletteColor(si);
          return (
            <React.Fragment key={`series-${si}`}>
              {points.length > 1 ? (
                <Path
                  d={buildAreaPath(points, plot)}
                  fill={color}
                  fillOpacity={0.25}
                  stroke="none"
                />
              ) : null}
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
                <Circle key={`dot-${si}-${i}`} cx={p.x} cy={p.y} r={3} fill={color} />
              ))}
            </React.Fragment>
          );
        })}
        {labelIndices.map((i) => (
          <SvgText
            key={`label-${i}`}
            x={seriesPoints[0]?.[i]?.x ?? plot.innerLeft}
            y={plot.innerBottom + 16}
            fontSize={9}
            fill={theme.colors.textMuted}
            textAnchor="middle"
          >
            {truncateLabel(data.labels[i] ?? '')}
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
