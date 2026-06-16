import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';
import { DateFilterControl } from '@/ui/DateFilterControl';
import { Dropdown } from '@/ui/Dropdown';
import type { DashboardParameter } from '@/api/schemas';

export interface FiltersBarProps {
  parameters: DashboardParameter[];
  /** The currently-applied values, keyed by parameter id. */
  values: Record<string, unknown>;
  /** Called with the full edited value map (keyed by parameter id) on Apply. */
  onApply: (values: Record<string, unknown>) => void;
  /**
   * Lazily fetches the selectable values for a field/card-backed parameter
   * (called when its dropdown opens). Provided by the dashboard screen, which
   * has the dashboard id and an instance client. Omitted in contexts without
   * server access, in which case backed params fall back to a TextInput.
   */
  fetchParamValues?: (paramId: string) => Promise<string[]>;
}

/** Convert an applied value into the string shown in its TextInput / picker. */
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

/** True for parameters that should use the calendar picker. */
function isDateParam(type: string): boolean {
  return type.startsWith('date');
}

/**
 * True when the parameter's options come from a server-backed source (a field
 * or another card) rather than a static list — i.e. a non-empty source type
 * that isn't 'static-list'. These are fetched lazily when the dropdown opens.
 */
function isBackedSource(valuesSourceType: string): boolean {
  return valuesSourceType !== '' && valuesSourceType !== 'static-list';
}

/**
 * A simple, Expo-Go-safe filter bar. A header row ("Filters" + a chevron)
 * toggles between collapsed (header only, with a count of non-empty filters)
 * and expanded (one labeled control per dashboard parameter + an Apply button).
 * Date-type parameters (type starting with 'date') render a
 * {@link DateFilterControl} whose serialized Metabase value string flows through
 * the edit state unchanged; static/backed params a Dropdown; everything else a
 * TextInput. Local edit state is seeded from the applied values and committed via
 * {@link FiltersBarProps.onApply}. Renders nothing when there are no parameters.
 */
export function FiltersBar({
  parameters,
  values,
  onApply,
  fetchParamValues,
}: FiltersBarProps): React.ReactElement | null {
  const theme = useTheme();
  const { t } = useTranslation();
  const [edits, setEdits] = React.useState<Record<string, string>>(() =>
    seedEdits(parameters, values),
  );
  const [expanded, setExpanded] = React.useState(true);

  // Re-seed when the applied values or parameter set change (e.g. dashboard
  // finishes loading, or Apply elsewhere replaces the values).
  React.useEffect(() => {
    setEdits(seedEdits(parameters, values));
  }, [parameters, values]);

  if (parameters.length === 0) return null;

  function setEdit(id: string, text: string): void {
    setEdits((prev) => ({ ...prev, [id]: text }));
  }

  function apply(): void {
    const next: Record<string, unknown> = {};
    for (const p of parameters) {
      next[p.id] = edits[p.id] ?? '';
    }
    onApply(next);
  }

  const activeCount = parameters.reduce(
    (n, p) => (edits[p.id] != null && edits[p.id] !== '' ? n + 1 : n),
    0,
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
        style={styles.header}
      >
        <Text style={[styles.heading, { color: theme.colors.textMuted }]}>
          {t('dashboard.filters')}
          {!expanded && activeCount > 0 ? ` (${activeCount})` : ''}
        </Text>
        <Text style={[styles.chevron, { color: theme.colors.textMuted }]}>
          {expanded ? '▾' : '▸'}
        </Text>
      </Pressable>

      {expanded ? (
        <>
          {parameters.map((p) => {
            const type = p.type ?? '';
            const current = edits[p.id] ?? '';
            const hasStaticValues = p.values.length > 0;
            const backed = isBackedSource(p.valuesSourceType) && fetchParamValues != null;
            return (
              <View key={p.id} style={styles.field}>
                <Text style={[styles.label, { color: theme.colors.text }]}>{p.name ?? ''}</Text>
                {isDateParam(type) ? (
                  <DateFilterControl
                    value={current !== '' ? current : null}
                    onChange={(serialized) => setEdit(p.id, serialized)}
                    placeholder={type}
                  />
                ) : hasStaticValues ? (
                  <Dropdown
                    value={current !== '' ? current : null}
                    options={p.values}
                    onChange={(v) => setEdit(p.id, v ?? '')}
                  />
                ) : backed && fetchParamValues != null ? (
                  <BackedDropdown
                    paramId={p.id}
                    value={current !== '' ? current : null}
                    onChange={(v) => setEdit(p.id, v ?? '')}
                    fetchParamValues={fetchParamValues}
                  />
                ) : (
                  <TextInput
                    value={current}
                    onChangeText={(text) => setEdit(p.id, text)}
                    onSubmitEditing={apply}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType={type.startsWith('number') ? 'numeric' : 'default'}
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
                )}
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
        </>
      ) : null}
    </View>
  );
}

/**
 * A {@link Dropdown} for a field/card-backed parameter. The options are fetched
 * lazily the first time the dropdown opens (via React Query keyed by paramId),
 * showing a spinner while in flight. An empty/failed fetch yields no options.
 */
function BackedDropdown({
  paramId,
  value,
  onChange,
  fetchParamValues,
}: {
  paramId: string;
  value: string | null;
  onChange: (value: string | null) => void;
  fetchParamValues: (paramId: string) => Promise<string[]>;
}): React.ReactElement {
  const [opened, setOpened] = React.useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['paramValues', paramId],
    enabled: opened,
    queryFn: () => fetchParamValues(paramId),
  });

  return (
    <Dropdown
      value={value}
      options={data ?? []}
      onChange={onChange}
      onOpen={() => setOpened(true)}
      loading={opened && isLoading}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8, borderBottomWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  chevron: { fontSize: 12, fontWeight: '600' },
  field: { gap: 4 },
  label: { fontSize: 13, fontWeight: '500' },
  input: { borderWidth: 1 },
  button: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
});
