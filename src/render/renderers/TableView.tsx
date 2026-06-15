import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { formatValue } from '@/render/normalize';
import type { QueryResult } from '@/api/schemas';

export interface TableViewProps {
  result: QueryResult;
}

const MAX_ROWS = 100;
const CELL_MIN_WIDTH = 120;

/**
 * Renders a query result as a horizontally scrollable grid: a header row of
 * column display names followed by formatted body cells. Caps the body at
 * MAX_ROWS and shows a "showing N of M" note when more rows exist.
 */
export function TableView({ result }: TableViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();

  const { cols, rows } = result;
  const total = rows.length;
  const visibleRows = total > MAX_ROWS ? rows.slice(0, MAX_ROWS) : rows;

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View
            style={[
              styles.row,
              { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border },
            ]}
          >
            {cols.map((col, i) => (
              <View key={`h-${i}`} style={[styles.cell, { borderRightColor: theme.colors.border }]}>
                <Text style={[styles.headerText, { color: theme.colors.text }]} numberOfLines={1}>
                  {col.displayName}
                </Text>
              </View>
            ))}
          </View>

          {visibleRows.map((row, r) => (
            <View key={`r-${r}`} style={[styles.row, { borderBottomColor: theme.colors.border }]}>
              {cols.map((col, c) => (
                <View
                  key={`c-${r}-${c}`}
                  style={[styles.cell, { borderRightColor: theme.colors.border }]}
                >
                  <Text style={[styles.cellText, { color: theme.colors.text }]} numberOfLines={1}>
                    {formatValue(row[c], col)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      {total > MAX_ROWS ? (
        <Text style={[styles.note, { color: theme.colors.textMuted }]}>
          {t('chart.showingNofM', { shown: MAX_ROWS, total })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  cell: {
    minWidth: CELL_MIN_WIDTH,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  headerText: { fontSize: 13, fontWeight: '600' },
  cellText: { fontSize: 13 },
  note: { fontSize: 12, marginTop: 8, textAlign: 'center' },
});
