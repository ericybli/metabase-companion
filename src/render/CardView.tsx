import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { ScalarView } from '@/render/renderers/ScalarView';
import { SmartScalarView } from '@/render/renderers/SmartScalarView';
import { ProgressView } from '@/render/renderers/ProgressView';
import { GaugeView } from '@/render/renderers/GaugeView';
import { FunnelView } from '@/render/renderers/FunnelView';
import { TableView } from '@/render/renderers/TableView';
import { BarChartView } from '@/render/renderers/BarChartView';
import { LineChartView } from '@/render/renderers/LineChartView';
import { AreaChartView } from '@/render/renderers/AreaChartView';
import { ComboChartView } from '@/render/renderers/ComboChartView';
import { RowChartView } from '@/render/renderers/RowChartView';
import { PieChartView } from '@/render/renderers/PieChartView';
import { ScatterChartView } from '@/render/renderers/ScatterChartView';
import { WaterfallChartView } from '@/render/renderers/WaterfallChartView';
import type { QueryResult } from '@/api/schemas';

export interface CardViewProps {
  display: string;
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  name: string;
  /**
   * Optional chart height in px, forwarded to the chart renderers (bar/line/
   * area/pie). Omitted -> each renderer's default (~220px). Lets a fullscreen
   * consumer make charts taller without changing the inline default.
   */
  height?: number;
}

/**
 * Registry that picks a native renderer from a card's `display`:
 *   scalar -> ScalarView, smartscalar -> SmartScalarView (latest-vs-previous
 *   trend), progress -> ProgressView (value vs goal bar), gauge -> GaugeView
 *   (value within colored segment ranges on a dial), funnel -> FunnelView
 *   (decreasing stages, first = 100%), table/pivot ->
 *   TableView, bar -> BarChartView, row -> RowChartView (horizontal bars),
 *   line -> LineChartView, area -> AreaChartView, combo -> ComboChartView
 *   (mixed bar + line), pie -> PieChartView, scatter -> ScatterChartView
 *   (numeric x/y, optional bubble size), waterfall -> WaterfallChartView
 *   (running-total floating bars). Any unknown display falls back to TableView
 *   (we always have the rows) prefixed by a small note that explains the
 *   substitution.
 *
 * If the result carries an error or a non-completed status, renders a themed
 * error message instead of a chart or "No data".
 */
export function CardView({
  display,
  result,
  vizSettings,
  name,
  height,
}: CardViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();

  // Surface query failures before attempting any renderer.
  if (result.error != null || (result.status !== undefined && result.status !== 'completed')) {
    const message = result.error ?? t('chart.queryFailed');
    return (
      <View style={styles.errorContainer}>
        <Text style={[styles.errorText, { color: theme.colors.danger }]}>{message}</Text>
      </View>
    );
  }

  switch (display) {
    case 'scalar':
      return <ScalarView result={result} vizSettings={vizSettings} name={name} />;
    case 'smartscalar':
      return <SmartScalarView result={result} vizSettings={vizSettings} name={name} />;
    case 'progress':
      return <ProgressView result={result} vizSettings={vizSettings} name={name} />;
    case 'gauge':
      return <GaugeView result={result} vizSettings={vizSettings} name={name} />;
    case 'funnel':
      return <FunnelView result={result} vizSettings={vizSettings} name={name} />;
    case 'table':
    case 'pivot':
      return <TableView result={result} />;
    case 'bar':
      return <BarChartView result={result} vizSettings={vizSettings} height={height} />;
    case 'row':
      return <RowChartView result={result} vizSettings={vizSettings} height={height} />;
    case 'line':
      return <LineChartView result={result} vizSettings={vizSettings} height={height} />;
    case 'area':
      return <AreaChartView result={result} vizSettings={vizSettings} height={height} />;
    case 'combo':
      return <ComboChartView result={result} vizSettings={vizSettings} height={height} />;
    case 'pie':
      return <PieChartView result={result} vizSettings={vizSettings} height={height} />;
    case 'scatter':
      return <ScatterChartView result={result} vizSettings={vizSettings} height={height} />;
    case 'waterfall':
      return <WaterfallChartView result={result} vizSettings={vizSettings} height={height} />;
    default:
      return <UnsupportedTable display={display} result={result} />;
  }
}

function UnsupportedTable({
  display,
  result,
}: {
  display: string;
  result: QueryResult;
}): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View>
      <Text style={[styles.note, { color: theme.colors.textMuted }]}>
        {t('chart.unsupported', { display })}
      </Text>
      <TableView result={result} />
    </View>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, marginBottom: 8 },
  errorContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  errorText: { fontSize: 14, textAlign: 'center' },
});
