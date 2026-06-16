import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Path, Polygon } from 'react-native-svg';
import '@/ui/i18n';
import { GaugeView } from './GaugeView';
import type { QueryResult } from '@/api/schemas';

const metricCol = {
  name: 'score',
  displayName: 'Score',
  baseType: 'type/Integer',
  semanticType: null,
  fieldId: null,
};

function single(value: unknown): QueryResult {
  return { rows: [[value]], cols: [metricCol], rowCount: 1, status: 'completed', error: null };
}

const threeSegments = {
  'gauge.segments': [
    { min: 0, max: 30, color: '#EF8C8C', label: 'Low' },
    { min: 30, max: 70, color: '#F9D45C', label: 'Mid' },
    { min: 70, max: 100, color: '#88BF4D', label: 'High' },
  ],
};

/** Arc paths use the SVG elliptical-arc command "A"; the needle does not. */
function arcPaths(paths: { props: { d?: string } }[]): { props: { d?: string; fill?: string } }[] {
  return paths.filter((p) => typeof p.props.d === 'string' && p.props.d.includes('A '));
}

describe('GaugeView', () => {
  it('renders one colored arc per segment plus a background arc', async () => {
    const { UNSAFE_getAllByType } = await render(
      <GaugeView result={single(50)} vizSettings={threeSegments} name="G" />,
    );
    // 1 background arc + 3 segment arcs = 4 arc Paths.
    const paths = arcPaths(UNSAFE_getAllByType(Path));
    expect(paths).toHaveLength(4);
    // The three segment colors must each be present.
    const fills = paths.map((p) => p.props.fill);
    expect(fills).toContain('#EF8C8C');
    expect(fills).toContain('#F9D45C');
    expect(fills).toContain('#88BF4D');
  });

  it('renders a value marker (needle polygon)', async () => {
    const { UNSAFE_getAllByType } = await render(
      <GaugeView result={single(50)} vizSettings={threeSegments} name="G" />,
    );
    expect(UNSAFE_getAllByType(Polygon).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the formatted value in the center', async () => {
    await render(<GaugeView result={single(50)} vizSettings={threeSegments} name="G" />);
    expect(screen.getByText('50')).toBeTruthy();
  });

  it('shows the boundary labels (min, internal edges, max)', async () => {
    await render(<GaugeView result={single(50)} vizSettings={threeSegments} name="G" />);
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('30')).toBeTruthy();
    expect(screen.getByText('70')).toBeTruthy();
    expect(screen.getByText('100')).toBeTruthy();
  });

  it('shows a no-data message when there are no columns', async () => {
    const result: QueryResult = {
      rows: [],
      cols: [],
      rowCount: 0,
      status: 'completed',
      error: null,
    };
    await render(<GaugeView result={result} vizSettings={threeSegments} name="G" />);
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('renders a single fallback segment when none are configured', async () => {
    const { UNSAFE_getAllByType } = await render(
      <GaugeView result={single(42)} vizSettings={{}} name="G" />,
    );
    // 1 background arc + 1 fallback segment arc = 2 arc Paths.
    expect(arcPaths(UNSAFE_getAllByType(Path))).toHaveLength(2);
    expect(screen.getByText('42')).toBeTruthy();
  });
});
