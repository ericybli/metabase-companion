import { buildPivotModel } from './pivotModel';
import type { QueryColumn, QueryResult } from '@/api/schemas';

const regionCol: QueryColumn = {
  name: 'Region',
  displayName: 'Region',
  baseType: 'type/Text',
  semanticType: null,
};
const yearCol: QueryColumn = {
  name: 'Year',
  displayName: 'Year',
  baseType: 'type/Text',
  semanticType: null,
};
const totalCol: QueryColumn = {
  name: 'Total',
  displayName: 'Total',
  baseType: 'type/Float',
  semanticType: null,
};

function result(cols: QueryColumn[], rows: unknown[][]): QueryResult {
  return { cols, rows, rowCount: rows.length, status: 'completed', error: null };
}

describe('buildPivotModel', () => {
  it('groups rows × one column field × one measure into a matrix', () => {
    const r = result(
      [regionCol, yearCol, totalCol],
      [
        ['West', '2023', 100],
        ['West', '2024', 130],
        ['East', '2023', 80],
        ['East', '2024', 95],
      ],
    );
    const model = buildPivotModel(r, {
      'pivot_table.column_split': {
        rows: ['Region'],
        columns: ['Year'],
        values: ['Total'],
      },
    });
    expect(model).not.toBeNull();
    expect(model?.rowFieldNames).toEqual(['Region']);
    // Column headers come from the distinct values of the column field, ascending.
    expect(model?.colHeaders).toEqual(['2023', '2024']);
    // Rows sorted ascending by their header tuple.
    expect(model?.rows.map((row) => row.headers)).toEqual([['East'], ['West']]);
    expect(model?.rows.map((row) => row.cells)).toEqual([
      [80, 95],
      [100, 130],
    ]);
  });

  it('sums duplicate source rows that collide on the same cell', () => {
    const r = result(
      [regionCol, yearCol, totalCol],
      [
        ['West', '2023', 100],
        ['West', '2023', 25], // duplicate cell (West, 2023) → summed to 125
        ['East', '2023', 80],
      ],
    );
    const model = buildPivotModel(r, {
      'pivot_table.column_split': {
        rows: ['Region'],
        columns: ['Year'],
        values: ['Total'],
      },
    });
    expect(model?.colHeaders).toEqual(['2023']);
    expect(model?.rows.map((row) => row.headers)).toEqual([['East'], ['West']]);
    expect(model?.rows.map((row) => row.cells)).toEqual([[80], [125]]);
  });

  it('fills missing cells with null', () => {
    // "Pro" has no 2024 row; "West" has no 2023 row.
    const r = result(
      [regionCol, yearCol, totalCol],
      [
        ['West', '2024', 130],
        ['East', '2023', 80],
        ['East', '2024', 95],
      ],
    );
    const model = buildPivotModel(r, {
      'pivot_table.column_split': {
        rows: ['Region'],
        columns: ['Year'],
        values: ['Total'],
      },
    });
    expect(model?.colHeaders).toEqual(['2023', '2024']);
    // East: [80, 95], West: [null, 130]
    expect(model?.rows.map((row) => row.headers)).toEqual([['East'], ['West']]);
    expect(model?.rows.map((row) => row.cells)).toEqual([
      [80, 95],
      [null, 130],
    ]);
  });

  it('supports zero column fields (grouped list, one cell per row)', () => {
    const countryCol: QueryColumn = {
      name: 'Country',
      displayName: 'Country',
      baseType: 'type/Text',
      semanticType: null,
    };
    const cityCol: QueryColumn = {
      name: 'City',
      displayName: 'City',
      baseType: 'type/Text',
      semanticType: null,
    };
    const revenueCol: QueryColumn = {
      name: 'Revenue',
      displayName: 'Revenue',
      baseType: 'type/Float',
      semanticType: null,
    };
    const r = result(
      [countryCol, cityCol, revenueCol],
      [
        ['US', 'NYC', 50],
        ['US', 'LA', 40],
        ['CA', 'TOR', 20],
      ],
    );
    const model = buildPivotModel(r, {
      'pivot_table.column_split': {
        rows: ['Country', 'City'],
        columns: [],
        values: ['Revenue'],
      },
    });
    expect(model?.rowFieldNames).toEqual(['Country', 'City']);
    // No column field → one leaf column labelled by the measure.
    expect(model?.colHeaders).toEqual(['Revenue']);
    expect(model?.rows.map((row) => row.headers)).toEqual([
      ['CA', 'TOR'],
      ['US', 'LA'],
      ['US', 'NYC'],
    ]);
    expect(model?.rows.map((row) => row.cells)).toEqual([[20], [40], [50]]);
  });

  it('computes a grand total when the measure is additive', () => {
    const r = result(
      [regionCol, yearCol, totalCol],
      [
        ['West', '2023', 100],
        ['West', '2024', 130],
        ['East', '2023', 80],
      ],
    );
    const model = buildPivotModel(r, {
      'pivot_table.column_split': {
        rows: ['Region'],
        columns: ['Year'],
        values: ['Total'],
      },
    });
    // grandTotal aligns to colHeaders: 2023 = 80+100 = 180, 2024 = 130.
    expect(model?.grandTotal).toEqual([180, 130]);
  });

  it('returns null when there is more than one measure', () => {
    const otherCol: QueryColumn = {
      name: 'Other',
      displayName: 'Other',
      baseType: 'type/Float',
      semanticType: null,
    };
    const r = result([regionCol, yearCol, totalCol, otherCol], [['West', '2023', 100, 1]]);
    const model = buildPivotModel(r, {
      'pivot_table.column_split': {
        rows: ['Region'],
        columns: ['Year'],
        values: ['Total', 'Other'],
      },
    });
    expect(model).toBeNull();
  });

  it('returns null when there is more than one column field', () => {
    const quarterCol: QueryColumn = {
      name: 'Quarter',
      displayName: 'Quarter',
      baseType: 'type/Text',
      semanticType: null,
    };
    const r = result([regionCol, yearCol, quarterCol, totalCol], [['West', '2023', 'Q1', 100]]);
    const model = buildPivotModel(r, {
      'pivot_table.column_split': {
        rows: ['Region'],
        columns: ['Year', 'Quarter'],
        values: ['Total'],
      },
    });
    expect(model).toBeNull();
  });

  it('returns null when the pivot config is absent', () => {
    const r = result([regionCol, yearCol, totalCol], [['West', '2023', 100]]);
    expect(buildPivotModel(r, {})).toBeNull();
  });

  it('returns null when there are no value fields after resolution', () => {
    const r = result([regionCol, yearCol, totalCol], [['West', '2023', 100]]);
    const model = buildPivotModel(r, {
      'pivot_table.column_split': {
        rows: ['Region'],
        columns: ['Year'],
        values: ['DoesNotExist'],
      },
    });
    expect(model).toBeNull();
  });

  it('returns null when both rows and columns are empty', () => {
    const r = result([regionCol, yearCol, totalCol], [['West', '2023', 100]]);
    const model = buildPivotModel(r, {
      'pivot_table.column_split': {
        rows: [],
        columns: [],
        values: ['Total'],
      },
    });
    expect(model).toBeNull();
  });

  it('resolves field refs (legacy column_split entries) by name', () => {
    const r = result(
      [regionCol, yearCol, totalCol],
      [
        ['West', '2023', 100],
        ['East', '2023', 80],
      ],
    );
    const model = buildPivotModel(r, {
      'pivot_table.column_split': {
        rows: [['field', 'Region', { 'base-type': 'type/Text' }]],
        columns: [['field', 'Year', null]],
        values: [['field', 'Total', null]],
      },
    });
    expect(model?.colHeaders).toEqual(['2023']);
    expect(model?.rows.map((row) => row.headers)).toEqual([['East'], ['West']]);
    expect(model?.rows.map((row) => row.cells)).toEqual([[80], [100]]);
  });

  it('falls back to legacy pivot_rows / pivot_cols index arrays', () => {
    const r = result(
      [regionCol, yearCol, totalCol],
      [
        ['West', '2023', 100],
        ['East', '2024', 95],
      ],
    );
    const model = buildPivotModel(r, {
      pivot_rows: [0],
      pivot_cols: [1],
    });
    expect(model?.rowFieldNames).toEqual(['Region']);
    expect(model?.colHeaders).toEqual(['2023', '2024']);
    expect(model?.rows.map((row) => row.headers)).toEqual([['East'], ['West']]);
    // East 2024 = 95, West 2023 = 100; missing cells null.
    expect(model?.rows.map((row) => row.cells)).toEqual([
      [null, 95],
      [100, null],
    ]);
  });

  it('sorts numeric column headers numerically, not lexically', () => {
    const monthCol: QueryColumn = {
      name: 'Month',
      displayName: 'Month',
      baseType: 'type/Integer',
      semanticType: null,
    };
    const r = result(
      [regionCol, monthCol, totalCol],
      [
        ['West', 2, 20],
        ['West', 10, 10],
        ['West', 1, 30],
      ],
    );
    const model = buildPivotModel(r, {
      'pivot_table.column_split': {
        rows: ['Region'],
        columns: ['Month'],
        values: ['Total'],
      },
    });
    // 1, 2, 10 (numeric), not 1, 10, 2 (lexical).
    expect(model?.colHeaders).toEqual(['1', '2', '10']);
    expect(model?.rows[0]?.cells).toEqual([30, 20, 10]);
  });

  it('returns an empty-row model with headers when there are no rows', () => {
    const r = result([regionCol, yearCol, totalCol], []);
    const model = buildPivotModel(r, {
      'pivot_table.column_split': {
        rows: ['Region'],
        columns: ['Year'],
        values: ['Total'],
      },
    });
    expect(model).not.toBeNull();
    expect(model?.rows).toEqual([]);
    expect(model?.colHeaders).toEqual([]);
  });
});
