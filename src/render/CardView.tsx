import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { ScalarView } from '@/render/renderers/ScalarView';
import { TableView } from '@/render/renderers/TableView';
import { BarChartView } from '@/render/renderers/BarChartView';
import { LineChartView } from '@/render/renderers/LineChartView';
import { AreaChartView } from '@/render/renderers/AreaChartView';
import { PieChartView } from '@/render/renderers/PieChartView';
import type { QueryResult } from '@/api/schemas';

export interface CardViewProps {
  display: string;
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  name: string;
}

/**
 * Registry that picks a native renderer from a card's `display`:
 *   scalar/smartscalar -> ScalarView, table/pivot -> TableView,
 *   bar/row -> BarChartView, line -> LineChartView, area -> AreaChartView,
 *   pie -> PieChartView. Any unknown display falls back to TableView (we
 *   always have the rows) prefixed by a small note that explains the
 *   substitution.
 */
export function CardView({
  display,
  result,
  vizSettings,
  name,
}: CardViewProps): React.ReactElement {
  switch (display) {
    case 'scalar':
    case 'smartscalar':
      return <ScalarView result={result} vizSettings={vizSettings} name={name} />;
    case 'table':
    case 'pivot':
      return <TableView result={result} />;
    case 'bar':
    case 'row':
      return <BarChartView result={result} vizSettings={vizSettings} />;
    case 'line':
      return <LineChartView result={result} vizSettings={vizSettings} />;
    case 'area':
      return <AreaChartView result={result} vizSettings={vizSettings} />;
    case 'pie':
      return <PieChartView result={result} vizSettings={vizSettings} />;
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
});
