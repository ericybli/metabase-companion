import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Rect } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import { buildProgressModel, type ProgressStatus } from '@/viz/model/progressModel';
import type { QueryResult } from '@/api/schemas';

export interface ProgressViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  name: string;
}

/** Track height and corner radius for the bar, in px. */
const BAR_HEIGHT = 20;
const BAR_RADIUS = 5;
/** Fixed viewBox width; the bar scales to fill via preserveAspectRatio. */
const VIEW_WIDTH = 100;

/**
 * Progress: value (first row's numeric metric) vs. a goal
 * (`progress.goal`). Renders a horizontal track with a filled portion whose
 * width is clamp(value/goal, 0, 1) of the track, plus value / goal / percent
 * labels. The fill is themed primary; when the goal is exceeded it tints to
 * success(green), and when the value/goal is invalid it tints to muted.
 *
 * Falls back to a themed "no data" message when there is no numeric column or no
 * rows.
 */
export function ProgressView({ result, vizSettings }: ProgressViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();

  const model = buildProgressModel(result, vizSettings);

  if (!model) {
    return (
      <View style={styles.container}>
        <Text style={[styles.noData, { color: theme.colors.textMuted }]}>{t('chart.noData')}</Text>
      </View>
    );
  }

  const fillColor = statusColor(model.status, theme);
  const fillWidth = Math.max(0, Math.min(VIEW_WIDTH, model.barPercent * VIEW_WIDTH));

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={[styles.value, { color: theme.colors.text }]} numberOfLines={1}>
          {model.valueText}
        </Text>
        {model.percentText.length > 0 ? (
          <Text style={[styles.percent, { color: theme.colors.textMuted }]}>
            {model.percentText}
          </Text>
        ) : null}
      </View>

      <Svg
        width="100%"
        height={BAR_HEIGHT}
        viewBox={`0 0 ${VIEW_WIDTH} ${BAR_HEIGHT}`}
        preserveAspectRatio="none"
      >
        {/* Track. */}
        <Rect
          x={0}
          y={0}
          width={VIEW_WIDTH}
          height={BAR_HEIGHT}
          rx={BAR_RADIUS}
          ry={BAR_RADIUS}
          fill={theme.colors.border}
        />
        {/* Fill. */}
        {fillWidth > 0 ? (
          <Rect
            x={0}
            y={0}
            width={fillWidth}
            height={BAR_HEIGHT}
            rx={BAR_RADIUS}
            ry={BAR_RADIUS}
            fill={fillColor}
          />
        ) : null}
      </Svg>

      <View style={styles.bottomRow}>
        <Text style={[styles.goal, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {model.goalText}
        </Text>
        {model.message.length > 0 ? (
          <Text style={[styles.message, { color: fillColor }]} numberOfLines={1}>
            {model.message}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Fill color by status: exceeded → success, invalid → muted, else primary. */
function statusColor(status: ProgressStatus, theme: ReturnType<typeof useTheme>): string {
  if (status === 'exceeded' || status === 'met') return theme.colors.success;
  if (status === 'invalid') return theme.colors.textMuted;
  return theme.colors.primary;
}

const styles = StyleSheet.create({
  container: { paddingVertical: 16, paddingHorizontal: 8 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  value: { fontSize: 28, fontWeight: '700', flexShrink: 1 },
  percent: { fontSize: 14, fontWeight: '600', marginLeft: 8 },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  goal: { fontSize: 12, flexShrink: 1 },
  message: { fontSize: 12, fontWeight: '600', marginLeft: 8 },
  noData: { fontSize: 14, textAlign: 'center' },
});
