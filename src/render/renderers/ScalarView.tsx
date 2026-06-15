import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { formatValue, isNumericType } from '@/render/normalize';
import type { QueryResult } from '@/api/schemas';

export interface ScalarViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  name: string;
}

/**
 * Renders a single scalar value in a large, bold style.
 *
 * Column selection: prefer the first numeric column (by isNumericType on
 * baseType); fall back to cols[0] if none is numeric. The value is taken from
 * the same column index in row 0.
 *
 * Falls back to a themed "no data" message when there are no rows.
 */
export function ScalarView({ result }: ScalarViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();

  const firstRow = result.rows[0];

  if (!firstRow) {
    return (
      <View style={styles.container}>
        <Text style={[styles.noData, { color: theme.colors.textMuted }]}>{t('chart.noData')}</Text>
      </View>
    );
  }

  // Pick the first numeric column; fall back to col 0.
  const numericColIndex = result.cols.findIndex((c) => isNumericType(c.baseType));
  const colIndex = numericColIndex >= 0 ? numericColIndex : 0;
  const col = result.cols[colIndex];

  if (!col) {
    return (
      <View style={styles.container}>
        <Text style={[styles.noData, { color: theme.colors.textMuted }]}>{t('chart.noData')}</Text>
      </View>
    );
  }

  const value = formatValue(firstRow[colIndex], col);

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
