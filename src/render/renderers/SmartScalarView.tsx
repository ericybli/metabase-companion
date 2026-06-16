import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Polygon } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import { buildSmartScalarModel, type TrendDirection } from '@/viz/model/smartScalarModel';
import type { QueryResult } from '@/api/schemas';

export interface SmartScalarViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  name: string;
}

/** Side length of the up/down triangle, in px. */
const ARROW_SIZE = 10;

/**
 * Trend / SmartScalar: from a time series (a dimension/time column + a numeric
 * metric column) show the LATEST metric value large, plus a comparison vs. the
 * previous period — the percent change with an up/down triangle and a
 * success(green)/danger(red) color, the absolute delta, and a muted "vs. …"
 * caption naming the previous period.
 *
 * Falls back to a single big value (no comparison) when there are fewer than two
 * usable points, and to a themed "no data" message when there is no numeric
 * metric column or no rows.
 */
export function SmartScalarView({ result, vizSettings }: SmartScalarViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();

  const model = buildSmartScalarModel(result, vizSettings);

  if (!model) {
    return (
      <View style={styles.container}>
        <Text style={[styles.noData, { color: theme.colors.textMuted }]}>{t('chart.noData')}</Text>
      </View>
    );
  }

  const { comparison } = model;
  const changeColor = comparison ? directionColor(comparison.direction, theme) : theme.colors.text;

  return (
    <View style={styles.container}>
      <Text style={[styles.value, { color: theme.colors.text }]}>{model.displayValue}</Text>
      <Text style={[styles.period, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {model.displayDate}
      </Text>

      {comparison ? (
        <View style={styles.comparisonRow}>
          {comparison.direction !== 'flat' ? (
            <DirectionArrow direction={comparison.direction} color={changeColor} />
          ) : null}
          <Text style={[styles.percent, { color: changeColor }]}>{comparison.percentText}</Text>
          {comparison.changeType === 'changed' ? (
            <Text style={[styles.delta, { color: theme.colors.textMuted }]}>
              ({comparison.deltaText})
            </Text>
          ) : null}
        </View>
      ) : null}

      {comparison ? (
        <Text style={[styles.caption, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {comparison.comparisonLabel}
        </Text>
      ) : null}
    </View>
  );
}

/** Resolve the change color: up → success(green), down → danger(red). */
function directionColor(direction: TrendDirection, theme: ReturnType<typeof useTheme>): string {
  if (direction === 'up') return theme.colors.success;
  if (direction === 'down') return theme.colors.danger;
  return theme.colors.textMuted;
}

/** A small up/down triangle drawn with SVG. */
function DirectionArrow({
  direction,
  color,
}: {
  direction: TrendDirection;
  color: string;
}): React.ReactElement {
  // Upward triangle points are flipped vertically for "down".
  const points =
    direction === 'up'
      ? `${ARROW_SIZE / 2},0 ${ARROW_SIZE},${ARROW_SIZE} 0,${ARROW_SIZE}`
      : `0,0 ${ARROW_SIZE},0 ${ARROW_SIZE / 2},${ARROW_SIZE}`;
  return (
    <Svg width={ARROW_SIZE} height={ARROW_SIZE} style={styles.arrow}>
      <Polygon points={points} fill={color} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  value: { fontSize: 40, fontWeight: '700' },
  period: { fontSize: 12, marginTop: 2 },
  comparisonRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  arrow: { marginRight: 4 },
  percent: { fontSize: 16, fontWeight: '600' },
  delta: { fontSize: 13, marginLeft: 6 },
  caption: { fontSize: 12, marginTop: 4 },
  noData: { fontSize: 14 },
});
