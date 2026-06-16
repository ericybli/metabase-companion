import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Rect } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import { buildFunnelModel } from '@/viz/model/funnelModel';
import type { QueryResult } from '@/api/schemas';

export interface FunnelViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  name: string;
}

/** Fixed viewBox width; bars scale to fill via preserveAspectRatio. */
const TRACK_WIDTH = 100;
/** Bar height in px. */
const BAR_HEIGHT = 26;
const BAR_RADIUS = 3;

/**
 * Funnel: each row is a stage with a label (dimension) and a numeric measure
 * (metric). Stages render top-to-bottom as horizontal bars; bar width is
 * proportional to the stage's measure relative to the largest stage (so bars
 * never overflow and the funnel tapers), while the displayed percent is the
 * stage's share of the FIRST stage (first = 100%). Each row shows its label, its
 * formatted value, and its percent-of-first; bars use the primary color at
 * decreasing opacity.
 *
 * Renders a themed "no data" message when there is no numeric column or no rows.
 */
export function FunnelView({ result, vizSettings }: FunnelViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();

  const model = buildFunnelModel(result, vizSettings);

  if (!model || model.stages.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.noData, { color: theme.colors.textMuted }]}>{t('chart.noData')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {model.stages.map((stage, i) => {
        const fillWidth = Math.max(0, Math.min(TRACK_WIDTH, stage.barFraction * TRACK_WIDTH));
        return (
          <View key={`stage-${i}`} style={styles.stage}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.colors.text }]} numberOfLines={1}>
                {stage.label}
              </Text>
              <Text style={[styles.percent, { color: theme.colors.textMuted }]}>
                {stage.percentText}
              </Text>
              <Text style={[styles.value, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {stage.valueText}
              </Text>
            </View>
            <Svg
              width="100%"
              height={BAR_HEIGHT}
              viewBox={`0 0 ${TRACK_WIDTH} ${BAR_HEIGHT}`}
              preserveAspectRatio="none"
            >
              <Rect
                x={0}
                y={0}
                width={fillWidth}
                height={BAR_HEIGHT}
                rx={BAR_RADIUS}
                ry={BAR_RADIUS}
                fill={theme.colors.primary}
                opacity={stage.opacity}
              />
            </Svg>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 12, paddingHorizontal: 8 },
  stage: { marginBottom: 10 },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 },
  label: { flex: 1, fontSize: 13, fontWeight: '600' },
  percent: { fontSize: 12, fontWeight: '600', marginHorizontal: 8 },
  value: { fontSize: 12 },
  noData: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
});
