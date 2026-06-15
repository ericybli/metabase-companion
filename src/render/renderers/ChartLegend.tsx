import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';

export interface ChartLegendProps {
  /** Series names, in series order. */
  names: string[];
  /** Resolve the swatch color for a series index. */
  colorAt: (index: number) => string;
  /**
   * Visibility flags, indexed by series. `hidden[i] === true` renders that
   * entry dimmed + struck-through. Defaults to all-visible when omitted.
   */
  hidden?: boolean[];
  /** Called with the series index when its legend entry is tapped. */
  onToggle?: (index: number) => void;
}

/**
 * Compact multi-series legend: a colored swatch + series name per entry,
 * wrapping across rows. Each entry is a <Pressable> that toggles its series'
 * visibility via {@link ChartLegendProps.onToggle}; hidden entries render dimmed
 * with a strikethrough so it's clear they're filtered out. Rendered with plain
 * RN <Text> so it's matchable by RNTL's getByText (unlike react-native-svg
 * <Text>).
 */
export function ChartLegend({
  names,
  colorAt,
  hidden,
  onToggle,
}: ChartLegendProps): React.ReactElement {
  const theme = useTheme();
  return (
    <View style={styles.legend}>
      {names.map((name, i) => {
        const isHidden = hidden?.[i] ?? false;
        return (
          <Pressable
            key={`legend-${i}`}
            testID={`chart-legend-${i}`}
            accessibilityRole="button"
            accessibilityState={{ selected: !isHidden }}
            onPress={() => onToggle?.(i)}
            style={[styles.legendItem, isHidden ? styles.legendItemHidden : null]}
          >
            <View style={[styles.swatch, { backgroundColor: colorAt(i) }]} />
            <Text
              style={[
                styles.legendLabel,
                { color: theme.colors.text },
                isHidden ? styles.legendLabelHidden : null,
              ]}
              numberOfLines={1}
            >
              {name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 2,
  },
  legendItemHidden: { opacity: 0.4 },
  swatch: { width: 10, height: 10, borderRadius: 2, marginRight: 4 },
  legendLabel: { fontSize: 11, maxWidth: 120 },
  legendLabelHidden: { textDecorationLine: 'line-through' },
});
