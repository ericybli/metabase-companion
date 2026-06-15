import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';

export interface ChartLegendProps {
  /** Series names, in series order. */
  names: string[];
  /** Resolve the swatch color for a series index. */
  colorAt: (index: number) => string;
}

/**
 * Compact multi-series legend: a colored swatch + series name per entry,
 * wrapping across rows. Rendered with plain RN <Text> so it's matchable by
 * RNTL's getByText (unlike react-native-svg <Text>).
 */
export function ChartLegend({ names, colorAt }: ChartLegendProps): React.ReactElement {
  const theme = useTheme();
  return (
    <View style={styles.legend}>
      {names.map((name, i) => (
        <View key={`legend-${i}`} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: colorAt(i) }]} />
          <Text style={[styles.legendLabel, { color: theme.colors.text }]} numberOfLines={1}>
            {name}
          </Text>
        </View>
      ))}
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
  swatch: { width: 10, height: 10, borderRadius: 2, marginRight: 4 },
  legendLabel: { fontSize: 11, maxWidth: 120 },
});
