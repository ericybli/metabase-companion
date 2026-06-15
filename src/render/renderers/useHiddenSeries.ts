import { useCallback, useMemo, useState } from 'react';

export interface UseHiddenSeries {
  /** Visibility mask, indexed by series: `hidden[i] === true` is filtered out. */
  hidden: boolean[];
  /**
   * Toggle a series' visibility. Hiding is ignored when it would hide the last
   * visible series, so at least one series is always drawn.
   */
  toggle: (index: number) => void;
}

/**
 * Visibility state for a multi-series chart's tappable legend. Tracks which
 * series indices are hidden so they can be excluded from drawing AND from the
 * y-axis domain calc (hiding a large series rescales the axis to reveal small
 * ones). Guarantees at least one series stays visible: a toggle that would hide
 * the last visible series is ignored.
 *
 * @param count number of series in the chart
 */
export function useHiddenSeries(count: number): UseHiddenSeries {
  const [hiddenSet, setHiddenSet] = useState<Set<number>>(() => new Set());

  const toggle = useCallback(
    (index: number): void => {
      setHiddenSet((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
          next.delete(index);
          return next;
        }
        // Hiding `index` — refuse if it would leave nothing visible.
        const visibleCount = count - next.size;
        if (visibleCount <= 1) {
          return prev;
        }
        next.add(index);
        return next;
      });
    },
    [count],
  );

  const hidden = useMemo(
    () => Array.from({ length: count }, (_, i) => hiddenSet.has(i)),
    [count, hiddenSet],
  );

  return { hidden, toggle };
}
