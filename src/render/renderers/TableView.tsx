import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { formatValue } from '@/render/normalize';
import type { QueryColumn, QueryResult } from '@/api/schemas';

export interface TableViewProps {
  result: QueryResult;
}

const MAX_ROWS = 100;
/** Minimum width (px) any column is given, so short columns stay tappable/readable. */
const COL_MIN_WIDTH = 90;
/** Maximum width (px) any column is given, so long content truncates instead of sprawling. */
const COL_MAX_WIDTH = 180;
/** Approximate px per character used to size columns from their content length. */
const PX_PER_CHAR = 8;
/** Horizontal padding inside a cell (both sides), added on top of the text width. */
const CELL_HPAD = 12;

/**
 * Compute a fixed width for each column, shared by the header cell and every
 * body cell in that column so columns line up regardless of per-row content
 * length. Width is derived from the longest of the header label and the given
 * body cells, clamped to [COL_MIN_WIDTH, COL_MAX_WIDTH].
 */
export function computeColumnWidths(cols: QueryColumn[], rows: unknown[][]): number[] {
  return cols.map((col, c) => {
    let longest = col.displayName.length;
    for (const row of rows) {
      const text = formatValue(row[c], col);
      if (text.length > longest) {
        longest = text.length;
      }
    }
    const raw = longest * PX_PER_CHAR + CELL_HPAD * 2;
    return Math.max(COL_MIN_WIDTH, Math.min(COL_MAX_WIDTH, raw));
  });
}

/**
 * Renders a query result as a horizontally scrollable grid: a header row of
 * column display names followed by formatted body cells. Each column is given a
 * single fixed width shared by its header cell and all of its body cells so the
 * columns stay aligned even when individual cells contain long content (which is
 * truncated with numberOfLines). Caps the body at MAX_ROWS and shows a
 * "showing N of M" note when more rows exist.
 */
export function TableView({ result }: TableViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();

  const { cols, rows } = result;
  const total = rows.length;
  const visibleRows = total > MAX_ROWS ? rows.slice(0, MAX_ROWS) : rows;

  const colWidths = computeColumnWidths(cols, visibleRows);

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View
            style={[
              styles.row,
              styles.headerRow,
              { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border },
            ]}
          >
            {cols.map((col, i) => (
              <View
                key={`h-${i}`}
                style={[
                  styles.cell,
                  { width: colWidths[i], borderRightColor: theme.colors.border },
                ]}
              >
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
                  style={[
                    styles.cell,
                    { width: colWidths[c], borderRightColor: theme.colors.border },
                  ]}
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
  headerRow: { borderBottomWidth: 2 },
  cell: {
    paddingHorizontal: CELL_HPAD,
    paddingVertical: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  headerText: { fontSize: 13, fontWeight: '700' },
  cellText: { fontSize: 13 },
  note: { fontSize: 12, marginTop: 8, textAlign: 'center' },
});
