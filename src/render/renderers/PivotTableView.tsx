import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { formatValue } from '@/viz/format';
import { TableView } from '@/render/renderers/TableView';
import { buildPivotModel, type PivotModel } from '@/viz/model/pivotModel';
import type { QueryResult } from '@/api/schemas';

export interface PivotTableViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
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

/** Clamp a content length (in chars) to a fixed pixel column width. */
function widthForChars(longestChars: number): number {
  const raw = longestChars * PX_PER_CHAR + CELL_HPAD * 2;
  return Math.max(COL_MIN_WIDTH, Math.min(COL_MAX_WIDTH, raw));
}

/**
 * Compute fixed widths for the left-edge row-field columns (one per row field)
 * and the body/value columns (one per column header), each derived from the
 * longest of its header label and its cell contents and clamped to
 * [COL_MIN_WIDTH, COL_MAX_WIDTH]. Sharing one width per column keeps the grid
 * aligned across horizontal scroll the same way TableView does.
 */
function computeWidths(
  model: PivotModel,
  rows: PivotModel['rows'],
): {
  rowColWidths: number[];
  bodyColWidths: number[];
} {
  const rowColWidths = model.rowFieldNames.map((name, i) => {
    let longest = name.length;
    for (const row of rows) {
      const cell = row.headers[i] ?? '';
      if (cell.length > longest) longest = cell.length;
    }
    return widthForChars(longest);
  });

  const bodyColWidths = model.colHeaders.map((header, c) => {
    let longest = header.length;
    for (const row of rows) {
      const text = formatCell(model, row.cells[c]);
      if (text.length > longest) longest = text.length;
    }
    if (model.grandTotal) {
      const totalText = formatCell(model, model.grandTotal[c] ?? null);
      if (totalText.length > longest) longest = totalText.length;
    }
    return widthForChars(longest);
  });

  return { rowColWidths, bodyColWidths };
}

/** Format a measure cell via @/viz/format using the model's value column; blank for null. */
function formatCell(model: PivotModel, value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return formatValue(value, model.valueColumn);
}

/**
 * Pivot table: reshapes a flat result into a 2D grid via `buildPivotModel`. When
 * the pivot config is missing or exceeds MVP scope the model is null and we fall
 * back to the plain `TableView` (the rows the user would otherwise see).
 *
 * The grid is horizontally scrollable with fixed per-column widths: the top-left
 * cells label the row fields, column headers run across the top, row-header cells
 * run down the left edge, and each measure cell is formatted via @/viz/format.
 * An additive measure adds a bottom "Grand total" row. The body is capped at
 * MAX_ROWS with a "showing N of M" note.
 */
export function PivotTableView({ result, vizSettings }: PivotTableViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();

  const model = buildPivotModel(result, vizSettings);
  if (!model) {
    return <TableView result={result} />;
  }

  const total = model.rows.length;
  const visibleRows = total > MAX_ROWS ? model.rows.slice(0, MAX_ROWS) : model.rows;
  const { rowColWidths, bodyColWidths } = computeWidths(model, visibleRows);

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Header row: row-field labels (top-left) then column headers. */}
          <View
            style={[
              styles.row,
              styles.headerRow,
              { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border },
            ]}
          >
            {model.rowFieldNames.map((name, i) => (
              <View
                key={`corner-${i}`}
                style={[
                  styles.cell,
                  { width: rowColWidths[i], borderRightColor: theme.colors.border },
                ]}
              >
                <Text style={[styles.headerText, { color: theme.colors.text }]} numberOfLines={1}>
                  {name}
                </Text>
              </View>
            ))}
            {model.colHeaders.map((header, c) => (
              <View
                key={`colh-${c}`}
                style={[
                  styles.cell,
                  styles.numericCell,
                  { width: bodyColWidths[c], borderRightColor: theme.colors.border },
                ]}
              >
                <Text style={[styles.headerText, { color: theme.colors.text }]} numberOfLines={1}>
                  {header}
                </Text>
              </View>
            ))}
          </View>

          {/* Body rows. */}
          {visibleRows.map((row, r) => (
            <View key={`r-${r}`} style={[styles.row, { borderBottomColor: theme.colors.border }]}>
              {model.rowFieldNames.map((_, i) => (
                <View
                  key={`rh-${r}-${i}`}
                  style={[
                    styles.cell,
                    {
                      width: rowColWidths[i],
                      borderRightColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                >
                  <Text
                    style={[styles.rowHeaderText, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {row.headers[i] ?? ''}
                  </Text>
                </View>
              ))}
              {model.colHeaders.map((_, c) => (
                <View
                  key={`cell-${r}-${c}`}
                  style={[
                    styles.cell,
                    styles.numericCell,
                    { width: bodyColWidths[c], borderRightColor: theme.colors.border },
                  ]}
                >
                  <Text style={[styles.cellText, { color: theme.colors.text }]} numberOfLines={1}>
                    {formatCell(model, row.cells[c])}
                  </Text>
                </View>
              ))}
            </View>
          ))}

          {/* Grand total row (additive measures only). */}
          {model.grandTotal ? (
            <View
              style={[
                styles.row,
                styles.totalRow,
                { borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
              ]}
            >
              {model.rowFieldNames.map((_, i) => (
                <View
                  key={`tot-h-${i}`}
                  style={[
                    styles.cell,
                    { width: rowColWidths[i], borderRightColor: theme.colors.border },
                  ]}
                >
                  {i === 0 ? (
                    <Text
                      style={[styles.rowHeaderText, { color: theme.colors.text }]}
                      numberOfLines={1}
                    >
                      {t('chart.pivotGrandTotal')}
                    </Text>
                  ) : null}
                </View>
              ))}
              {model.grandTotal.map((value, c) => (
                <View
                  key={`tot-${c}`}
                  style={[
                    styles.cell,
                    styles.numericCell,
                    { width: bodyColWidths[c], borderRightColor: theme.colors.border },
                  ]}
                >
                  <Text style={[styles.totalText, { color: theme.colors.text }]} numberOfLines={1}>
                    {formatCell(model, value)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
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
  totalRow: { borderTopWidth: 2, borderBottomWidth: 0 },
  cell: {
    paddingHorizontal: CELL_HPAD,
    paddingVertical: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  numericCell: { alignItems: 'flex-end' },
  headerText: { fontSize: 13, fontWeight: '700' },
  rowHeaderText: { fontSize: 13, fontWeight: '600' },
  cellText: { fontSize: 13 },
  totalText: { fontSize: 13, fontWeight: '700' },
  note: { fontSize: 12, marginTop: 8, textAlign: 'center' },
});
