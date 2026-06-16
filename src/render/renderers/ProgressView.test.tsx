import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Rect } from 'react-native-svg';
import '@/ui/i18n';
import { ProgressView } from './ProgressView';
import type { QueryResult } from '@/api/schemas';

const metricCol = {
  name: 'total',
  displayName: 'Total',
  baseType: 'type/Integer',
  semanticType: null,
};

function single(value: unknown): QueryResult {
  return { rows: [[value]], cols: [metricCol], rowCount: 1, status: 'completed', error: null };
}

/** The fill Rect is the second Rect (track is first); read its width. */
function fillWidth(rects: { props: { width?: number } }[]): number | undefined {
  return rects[1]?.props.width;
}

describe('ProgressView', () => {
  it('fills proportionally under goal and shows value, goal, and percent', async () => {
    const { UNSAFE_getAllByType } = await render(
      <ProgressView result={single(75)} vizSettings={{ 'progress.goal': 100 }} name="P" />,
    );
    expect(screen.getByText('75')).toBeTruthy();
    expect(screen.getByText('Goal 100')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    // Track + fill = 2 rects; fill width is 75% of the 100-unit viewBox.
    const rects = UNSAFE_getAllByType(Rect);
    expect(rects).toHaveLength(2);
    expect(fillWidth(rects)).toBeCloseTo(75);
  });

  it('clamps the fill to 100% when value exceeds the goal (>100%)', async () => {
    const { UNSAFE_getAllByType } = await render(
      <ProgressView result={single(150)} vizSettings={{ 'progress.goal': 100 }} name="P" />,
    );
    // Raw percent is shown un-clamped.
    expect(screen.getByText('150%')).toBeTruthy();
    expect(screen.getByText('Goal exceeded')).toBeTruthy();
    // ...but the fill width is clamped to the full 100-unit track.
    const rects = UNSAFE_getAllByType(Rect);
    expect(fillWidth(rects)).toBeCloseTo(100);
  });

  it('shows the full bar and "Goal met" when value === goal', async () => {
    const { UNSAFE_getAllByType } = await render(
      <ProgressView result={single(100)} vizSettings={{ 'progress.goal': 100 }} name="P" />,
    );
    expect(screen.getByText('Goal met')).toBeTruthy();
    expect(fillWidth(UNSAFE_getAllByType(Rect))).toBeCloseTo(100);
  });

  it('shows an empty bar and "Goal: Not set" with no goal', async () => {
    const { UNSAFE_getAllByType } = await render(
      <ProgressView result={single(50)} vizSettings={{}} name="P" />,
    );
    expect(screen.getByText('Goal: Not set')).toBeTruthy();
    // Only the track renders (no fill rect) when barPercent is 0.
    expect(UNSAFE_getAllByType(Rect)).toHaveLength(1);
  });

  it('shows a no-data message when there are no columns', async () => {
    const result: QueryResult = {
      rows: [],
      cols: [],
      rowCount: 0,
      status: 'completed',
      error: null,
    };
    await render(<ProgressView result={result} vizSettings={{ 'progress.goal': 100 }} name="P" />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
