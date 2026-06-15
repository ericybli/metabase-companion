import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';

/** Format a chart value for display in the tooltip. */
function formatTooltipValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString();
}

/** Minimal series shape the tooltip reads: a name and per-label values. */
export interface TooltipSeries {
  name: string;
  values: readonly (number | null)[];
}

export interface UseChartTooltip {
  /** The currently selected x-index, or null when nothing is selected. */
  selectedIndex: number | null;
  /** Toggle selection for an index (selecting the same index clears it). */
  toggleIndex: (index: number) => void;
  /** Clear any selection (e.g. when tapping empty space). */
  clear: () => void;
}

/**
 * Selection state for the tap-for-value tooltip shared by the cartesian charts.
 * Tapping a column selects it; tapping the same column again (or empty space)
 * clears it.
 */
export function useChartTooltip(): UseChartTooltip {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const toggleIndex = useCallback((index: number): void => {
    setSelectedIndex((prev) => (prev === index ? null : index));
  }, []);
  const clear = useCallback((): void => setSelectedIndex(null), []);
  return { selectedIndex, toggleIndex, clear };
}

export interface ChartTooltipProps {
  /** X-axis category labels. */
  labels: readonly string[];
  /** Series (name + values) the tooltip reads each selected value from. */
  series: readonly TooltipSeries[];
  /** The selected x-index, or null to render nothing. */
  selectedIndex: number | null;
  /** Plot center x of the selected band, used to anchor the tooltip. */
  anchorX: number;
  /** Full chart width, used to keep the tooltip on-screen. */
  width: number;
  /**
   * Visibility flags indexed by series; hidden series are omitted from the
   * tooltip. Defaults to all-visible when omitted.
   */
  hidden?: boolean[];
}

const TOOLTIP_WIDTH = 140;

/**
 * Themed, absolutely-positioned tooltip showing the x label and EACH series'
 * value at the selected index (multi-series aware). Rendered with plain RN
 * <Text> so it's matchable by RNTL's getByText. Renders nothing when no index
 * is selected.
 */
export function ChartTooltip({
  labels,
  series,
  selectedIndex,
  anchorX,
  width,
  hidden,
}: ChartTooltipProps): React.ReactElement | null {
  const theme = useTheme();
  if (selectedIndex === null) {
    return null;
  }
  const label = labels[selectedIndex];
  if (label === undefined) {
    return null;
  }

  // Keep the tooltip within the chart bounds.
  const half = TOOLTIP_WIDTH / 2;
  const clampedLeft = Math.max(0, Math.min(width - TOOLTIP_WIDTH, anchorX - half));

  return (
    <View
      testID="chart-tooltip"
      pointerEvents="none"
      style={[
        styles.tooltip,
        {
          left: clampedLeft,
          width: TOOLTIP_WIDTH,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.sm,
        },
      ]}
    >
      <Text style={[styles.label, { color: theme.colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      {series.map((s, si) =>
        hidden?.[si] ? null : (
          <Text
            key={`tt-${si}`}
            style={[styles.row, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {s.name}: {formatTooltipValue(s.values[selectedIndex] ?? null)}
          </Text>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    top: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
  },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  row: { fontSize: 11 },
});
