import { type QueryColumn, type QueryResult } from '@/api/schemas';

export interface ChartSeries {
  labels: string[];
  values: number[];
  metricName: string;
}

/**
 * Returns true for numeric Metabase base types.
 */
export function isNumericType(baseType: string): boolean {
  return (
    baseType === 'type/Integer' ||
    baseType === 'type/Float' ||
    baseType === 'type/Decimal' ||
    baseType === 'type/BigInteger' ||
    baseType === 'type/Number'
  );
}

/**
 * Format a cell value for display.
 * - null/undefined → '—'
 * - numeric: format as number; prefix '$' for Currency, multiply × 100 + '%' for Percentage
 * - date/datetime/time: human-readable string
 * - everything else: String(value)
 */
export function formatValue(value: unknown, col: QueryColumn): string {
  if (value === null || value === undefined) {
    return '—';
  }

  const { baseType, semanticType } = col;

  // Numeric types
  if (isNumericType(baseType) || typeof value === 'number') {
    const num = Number(value);
    if (isNaN(num)) {
      return String(value);
    }
    if (semanticType === 'type/Currency') {
      return '$' + num.toLocaleString();
    }
    if (semanticType === 'type/Percentage') {
      return (num * 100).toFixed(2) + '%';
    }
    return num.toLocaleString();
  }

  // Date / DateTime / Time types
  if (baseType.startsWith('type/Date') || baseType.startsWith('type/Time')) {
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString();
      }
    }
    return String(value);
  }

  return String(value);
}

/**
 * Zip each row with its columns by index, producing an array of Records
 * keyed by col.name.
 */
export function toRecords(result: QueryResult): Record<string, unknown>[] {
  const { rows, cols } = result;
  return rows.map((row) => {
    const record: Record<string, unknown> = {};
    cols.forEach((col, i) => {
      record[col.name] = row[i];
    });
    return record;
  });
}

/**
 * Multi-series chart data shape.
 * labels = one entry per row (x-axis / dimension values).
 * series = one entry per metric column.
 */
export interface ChartData {
  labels: string[];
  series: { name: string; values: number[] }[];
}

/**
 * Extract multi-series chart data from a query result.
 *
 * Dimension (x / labels): prefer graph.dimensions[0] matched by col.name;
 * else first non-numeric col; else first col.
 *
 * Series (y): if vizSettings['graph.metrics'] is a non-empty array, one series
 * per metric col matched by name; else one series per numeric column.
 * Each series value is coerced to number; null/NaN/undefined → 0.
 *
 * Returns null if there are no numeric/metric columns.
 */
export function toChartData(
  result: QueryResult,
  vizSettings: Record<string, unknown>,
): ChartData | null {
  const { rows, cols } = result;

  // --- Resolve dimension column ---
  let dimensionCol: QueryColumn | undefined;

  const graphDimensions = vizSettings['graph.dimensions'];
  if (Array.isArray(graphDimensions) && graphDimensions.length > 0) {
    const dimName = graphDimensions[0];
    if (typeof dimName === 'string') {
      dimensionCol = cols.find((c) => c.name === dimName);
    }
  }

  if (!dimensionCol) {
    dimensionCol = cols.find((c) => !isNumericType(c.baseType));
  }

  if (!dimensionCol) {
    dimensionCol = cols[0];
  }

  // --- Resolve metric columns ---
  let metricCols: QueryColumn[];

  const graphMetrics = vizSettings['graph.metrics'];
  if (Array.isArray(graphMetrics) && graphMetrics.length > 0) {
    const named = graphMetrics
      .filter((m): m is string => typeof m === 'string')
      .map((name) => cols.find((c) => c.name === name))
      .filter((c): c is QueryColumn => c !== undefined);
    metricCols = named;
  } else {
    metricCols = cols.filter((c) => isNumericType(c.baseType));
  }

  if (metricCols.length === 0) {
    return null;
  }

  // --- Build labels ---
  const resolvedDimensionCol: QueryColumn | undefined = dimensionCol;
  const dimensionIndex = resolvedDimensionCol ? cols.indexOf(resolvedDimensionCol) : -1;

  const labels = rows.map((row) => {
    if (!resolvedDimensionCol || dimensionIndex < 0) {
      return '—';
    }
    const cell = row[dimensionIndex];
    return formatValue(cell, resolvedDimensionCol);
  });

  // --- Build series ---
  const series = metricCols.map((metricCol) => {
    const metricIndex = cols.indexOf(metricCol);
    const values = rows.map((row) => {
      const cell = row[metricIndex];
      if (cell === null || cell === undefined || cell === '') {
        return 0;
      }
      const num = Number(cell);
      return isNaN(num) ? 0 : num;
    });
    return { name: metricCol.displayName, values };
  });

  return { labels, series };
}

/**
 * Extract chart series from a query result.
 *
 * Dimension (x / labels): prefer graph.dimensions[0] matched by col.name;
 * else first non-numeric col; else first col.
 *
 * Metric (y / values): prefer graph.metrics[0] matched by col.name;
 * else first numeric col.
 *
 * Returns null if no numeric metric column exists.
 */
export function toChartSeries(
  result: QueryResult,
  vizSettings: Record<string, unknown>,
): ChartSeries | null {
  const { rows, cols } = result;

  // --- Resolve metric column ---
  let metricCol: QueryColumn | undefined;

  const graphMetrics = vizSettings['graph.metrics'];
  if (Array.isArray(graphMetrics) && graphMetrics.length > 0) {
    const metricName = graphMetrics[0];
    if (typeof metricName === 'string') {
      metricCol = cols.find((c) => c.name === metricName);
    }
  }

  if (!metricCol) {
    metricCol = cols.find((c) => isNumericType(c.baseType));
  }

  // If there is no numeric metric column, return null
  if (!metricCol) {
    return null;
  }

  // --- Resolve dimension column ---
  let dimensionCol: QueryColumn | undefined;

  const graphDimensions = vizSettings['graph.dimensions'];
  if (Array.isArray(graphDimensions) && graphDimensions.length > 0) {
    const dimName = graphDimensions[0];
    if (typeof dimName === 'string') {
      dimensionCol = cols.find((c) => c.name === dimName);
    }
  }

  if (!dimensionCol) {
    dimensionCol = cols.find((c) => !isNumericType(c.baseType));
  }

  if (!dimensionCol) {
    // cols is guaranteed non-empty here: metricCol was found above, so cols.length >= 1
    dimensionCol = cols[0]!;
  }

  const resolvedDimensionCol: QueryColumn = dimensionCol;
  const metricIndex = cols.indexOf(metricCol);
  const dimensionIndex = cols.indexOf(resolvedDimensionCol);

  const labels = rows.map((row) => {
    const cell = row[dimensionIndex];
    return formatValue(cell, resolvedDimensionCol);
  });

  const values = rows.map((row) => {
    const cell = row[metricIndex];
    if (cell === null || cell === undefined || cell === '') {
      return 0;
    }
    const num = Number(cell);
    return isNaN(num) ? 0 : num;
  });

  return {
    labels,
    values,
    metricName: metricCol.displayName,
  };
}
