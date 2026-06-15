import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import type { DashboardParameter } from '@/api/schemas';

export interface FiltersBarProps {
  parameters: DashboardParameter[];
  /** The currently-applied values, keyed by parameter id. */
  values: Record<string, unknown>;
  /** Called with the full edited value map (keyed by parameter id) on Apply. */
  onApply: (values: Record<string, unknown>) => void;
}

/** Convert an applied value into the string shown in its TextInput. */
function toInputText(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

/** Seed the local edit state from the applied values, one entry per parameter. */
function seedEdits(
  parameters: DashboardParameter[],
  values: Record<string, unknown>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const p of parameters) {
    next[p.id] = toInputText(values[p.id]);
  }
  return next;
}

/**
 * A simple, Expo-Go-safe filter bar: one labeled TextInput per dashboard
 * parameter, holding local edit state seeded from the applied values, plus an
 * Apply button that commits the edits via {@link FiltersBarProps.onApply}.
 * Renders nothing when the dashboard has no parameters.
 */
export function FiltersBar({
  parameters,
  values,
  onApply,
}: FiltersBarProps): React.ReactElement | null {
  const theme = useTheme();
  const { t } = useTranslation();
  const [edits, setEdits] = React.useState<Record<string, string>>(() =>
    seedEdits(parameters, values),
  );

  // Re-seed when the applied values or parameter set change (e.g. dashboard
  // finishes loading, or Apply elsewhere replaces the values).
  React.useEffect(() => {
    setEdits(seedEdits(parameters, values));
  }, [parameters, values]);

  if (parameters.length === 0) return null;

  function apply() {
    const next: Record<string, unknown> = {};
    for (const p of parameters) {
      next[p.id] = edits[p.id] ?? '';
    }
    onApply(next);
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border },
      ]}
    >
      <Text style={[styles.heading, { color: theme.colors.textMuted }]}>
        {t('dashboard.filters')}
      </Text>
      {parameters.map((p) => {
        const type = p.type ?? '';
        const numeric = type.startsWith('number');
        return (
          <View key={p.id} style={styles.field}>
            <Text style={[styles.label, { color: theme.colors.text }]}>{p.name ?? ''}</Text>
            <TextInput
              value={edits[p.id] ?? ''}
              onChangeText={(text) => setEdits((prev) => ({ ...prev, [p.id]: text }))}
              onSubmitEditing={apply}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={numeric ? 'numeric' : 'default'}
              placeholder={type}
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.input,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  padding: theme.spacing(2),
                },
              ]}
            />
          </View>
        );
      })}
      <Pressable
        accessibilityRole="button"
        onPress={apply}
        style={[
          styles.button,
          { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md },
        ]}
      >
        <Text style={styles.buttonText}>{t('dashboard.apply')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8, borderBottomWidth: 1 },
  heading: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  field: { gap: 4 },
  label: { fontSize: 13, fontWeight: '500' },
  input: { borderWidth: 1 },
  button: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
});
