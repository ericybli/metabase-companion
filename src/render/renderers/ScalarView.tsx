import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { formatValue } from '@/render/normalize';
import type { QueryResult } from '@/api/schemas';

export interface ScalarViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  name: string;
}

/**
 * Renders a single scalar value (the first cell of the first row) in a large,
 * bold style. Falls back to a themed "no data" message when there are no rows
 * or columns.
 */
export function ScalarView({ result }: ScalarViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();

  const col = result.cols[0];
  const firstRow = result.rows[0];

  if (!col || !firstRow) {
    return (
      <View style={styles.container}>
        <Text style={[styles.noData, { color: theme.colors.textMuted }]}>{t('chart.noData')}</Text>
      </View>
    );
  }

  const value = formatValue(firstRow[0], col);

  return (
    <View style={styles.container}>
      <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  value: { fontSize: 40, fontWeight: '700' },
  noData: { fontSize: 14 },
});
