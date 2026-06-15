import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import { toChartData } from '@/render/normalize';
import { CHART_HEIGHT, getPieSlices, paletteColor } from '@/render/chartScale';
import type { QueryResult } from '@/api/schemas';

export interface PieChartViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
}

const PIE_SIZE = CHART_HEIGHT - 20; // square SVG side for the pie

/**
 * Pie chart: inherently single-series, so it uses the first series from
 * {@link toChartData}. One <Path> arc per value using cumulative angles (slice
 * fraction = value / sum) drawn with a small categorical palette, plus a legend
 * of color swatch + label + value. Renders a themed "no data" message when
 * there is no numeric series or every value is non-positive.
 */
export function PieChartView({ result, vizSettings }: PieChartViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();

  const data = toChartData(result, vizSettings);
  const series = data?.series[0];
  const labels = data?.labels ?? [];

  const radius = PIE_SIZE / 2 - 4;
  const center = PIE_SIZE / 2;
  const slices = series ? getPieSlices(series.values, center, center, radius) : [];

  if (!series || slices.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.noData, { color: theme.colors.textMuted }]}>{t('chart.noData')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {series.name}
      </Text>
      <View style={styles.pieRow}>
        <Svg width={PIE_SIZE} height={PIE_SIZE}>
          {slices.map((slice, i) =>
            slice.path ? (
              <Path
                key={`slice-${i}`}
                d={slice.path}
                fill={paletteColor(i)}
                stroke={theme.colors.background}
                strokeWidth={1}
              />
            ) : null,
          )}
        </Svg>
        <View style={styles.legend}>
          {labels.map((label, i) => (
            <View key={`legend-${i}`} style={styles.legendRow}>
              <View style={[styles.swatch, { backgroundColor: paletteColor(i) }]} />
              <Text style={[styles.legendLabel, { color: theme.colors.text }]} numberOfLines={1}>
                {label}
              </Text>
              <Text style={[styles.legendValue, { color: theme.colors.textMuted }]}>
                {String(series.values[i] ?? 0)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8 },
  title: { fontSize: 12, fontWeight: '600', marginBottom: 4, paddingHorizontal: 4 },
  noData: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  pieRow: { flexDirection: 'row', alignItems: 'center' },
  legend: { flex: 1, paddingLeft: 12 },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  swatch: { width: 10, height: 10, borderRadius: 2, marginRight: 6 },
  legendLabel: { flex: 1, fontSize: 12 },
  legendValue: { fontSize: 12, marginLeft: 6 },
});
