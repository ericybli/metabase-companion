import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';
import { DatePicker } from '@/ui/DatePicker';
import {
  RELATIVE_PRESETS,
  dateParamLabel,
  parseDateParam,
  serializeDateParam,
  type DateFilterValue,
} from '@/viz/params/dateParam';

export interface DateFilterControlProps {
  /** The current serialized value string (Metabase value string), or null. */
  value: string | null;
  /** Called with the new serialized value string. */
  onChange: (value: string) => void;
  /** Shown on the trigger when no value is set. */
  placeholder?: string;
}

/** Build the `=` (single date) value string for a 'YYYY-MM-DD' day, or null. */
function singleDateValue(yyyyMmDd: string | null): string | null {
  const v = toSpecific(yyyyMmDd, '=');
  return v == null ? null : serializeDateParam(v);
}

/** Build a between-range value string for two days, or null when incomplete. */
function rangeValue(start: string | null, end: string | null): string | null {
  if (start == null || end == null) return null;
  const a = parseIsoDay(start);
  const b = parseIsoDay(end);
  if (a == null || b == null) return null;
  // Keep chronological order regardless of pick order.
  const [lo, hi] = compareIsoDay(a, b) <= 0 ? [a, b] : [b, a];
  return serializeDateParam({ kind: 'specific', op: 'between', dates: [lo, hi], hasTime: false });
}

interface IsoDay {
  year: number;
  month: number; // 1-12
  day: number;
}

function parseIsoDay(s: string): IsoDay | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m == null) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function compareIsoDay(a: IsoDay, b: IsoDay): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** Build a specific {@link DateFilterValue} for a 'YYYY-MM-DD' day, or null. */
function toSpecific(yyyyMmDd: string | null, op: '=' | '<' | '>'): DateFilterValue | null {
  if (yyyyMmDd == null) return null;
  const d = parseIsoDay(yyyyMmDd);
  if (d == null) return null;
  return { kind: 'specific', op, dates: [d], hasTime: false };
}

/**
 * Extract the 'YYYY-MM-DD' day from a value string when it represents a single
 * specific date (op `=`), else null — used to seed the "Specific date" picker.
 */
function specificDayOf(value: string | null): string | null {
  const parsed = parseDateParam(value);
  if (parsed == null || parsed.kind !== 'specific' || parsed.op !== '=') return null;
  const d = parsed.dates[0];
  if (d == null) return null;
  return isoDay(d.year, d.month, d.day);
}

/** Extract [start, end] days from a between-range value, else [null, null]. */
function rangeDaysOf(value: string | null): [string | null, string | null] {
  const parsed = parseDateParam(value);
  if (parsed == null || parsed.kind !== 'specific' || parsed.op !== 'between') {
    return [null, null];
  }
  const [a, b] = parsed.dates;
  return [
    a != null ? isoDay(a.year, a.month, a.day) : null,
    b != null ? isoDay(b.year, b.month, b.day) : null,
  ];
}

function isoDay(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(
    2,
    '0',
  )}`;
}

type Mode = 'menu' | 'specific' | 'range';

/**
 * A themed, Expo-Go-safe control for Metabase-style date filters. The trigger
 * shows the current value's human label (or a placeholder). Tapping opens a Modal
 * offering relative presets (Today, Yesterday, Past 7/30 days, Past 3/6/12 months,
 * This/Previous week/month/quarter/year), a "Specific date" path (single
 * {@link DatePicker}) and a "Date range" path (two DatePickers). Selecting calls
 * {@link DateFilterControlProps.onChange} with the serialized Metabase value
 * string and closes the modal. Reuses {@link DatePicker} for calendar input.
 */
export function DateFilterControl({
  value,
  onChange,
  placeholder,
}: DateFilterControlProps): React.ReactElement {
  const theme = useTheme();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>('menu');
  const [specificDay, setSpecificDay] = React.useState<string | null>(null);
  const [rangeStart, setRangeStart] = React.useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = React.useState<string | null>(null);

  const label = value != null && value !== '' ? dateParamLabel(value) : '';

  function openModal(): void {
    // Seed the sub-pickers from the current value so re-opening lands on it.
    setSpecificDay(specificDayOf(value));
    const [s, e] = rangeDaysOf(value);
    setRangeStart(s);
    setRangeEnd(e);
    setMode('menu');
    setOpen(true);
  }

  function commit(serialized: string): void {
    onChange(serialized);
    setOpen(false);
    setMode('menu');
  }

  function pickPreset(presetValue: DateFilterValue): void {
    commit(serializeDateParam(presetValue));
  }

  function applySpecific(): void {
    const serialized = singleDateValue(specificDay);
    if (serialized != null) commit(serialized);
  }

  function applyRange(): void {
    const serialized = rangeValue(rangeStart, rangeEnd);
    if (serialized != null) commit(serialized);
  }

  const triggerText = label !== '' ? label : (placeholder ?? '');

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={openModal}
        style={[
          styles.trigger,
          {
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            padding: theme.spacing(2),
          },
        ]}
      >
        <Text
          style={{ color: label !== '' ? theme.colors.text : theme.colors.textMuted }}
          numberOfLines={1}
        >
          {triggerText}
        </Text>
        <Text style={[styles.caret, { color: theme.colors.textMuted }]}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg },
            ]}
            onPress={() => {}}
          >
            {mode === 'menu' ? (
              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {RELATIVE_PRESETS.map((preset) => {
                  const isSelected = value != null && serializeDateParam(preset.value) === value;
                  return (
                    <Pressable
                      key={preset.label}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => pickPreset(preset.value)}
                      style={[styles.row, { borderBottomColor: theme.colors.border }]}
                    >
                      <Text
                        style={{
                          color: isSelected ? theme.colors.primary : theme.colors.text,
                          fontWeight: isSelected ? '600' : '400',
                        }}
                      >
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setMode('specific')}
                  style={[styles.row, { borderBottomColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.text }}>Specific date…</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setMode('range')}
                  style={[styles.row, { borderBottomColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.text }}>Date range…</Text>
                </Pressable>
              </ScrollView>
            ) : mode === 'specific' ? (
              <View style={styles.pane}>
                <Text style={[styles.paneTitle, { color: theme.colors.text }]}>Specific date</Text>
                <DatePicker
                  value={specificDay}
                  onChange={setSpecificDay}
                  placeholder="Pick a date"
                />
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setMode('menu')}
                    style={styles.secondaryButton}
                  >
                    <Text style={{ color: theme.colors.textMuted }}>Back</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: specificDay == null }}
                    onPress={applySpecific}
                    style={[
                      styles.primaryButton,
                      {
                        backgroundColor: theme.colors.primary,
                        borderRadius: theme.radius.md,
                        opacity: specificDay == null ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Text style={styles.primaryButtonText}>Apply</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.pane}>
                <Text style={[styles.paneTitle, { color: theme.colors.text }]}>Date range</Text>
                <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Start</Text>
                <DatePicker value={rangeStart} onChange={setRangeStart} placeholder="Start date" />
                <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>End</Text>
                <DatePicker value={rangeEnd} onChange={setRangeEnd} placeholder="End date" />
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setMode('menu')}
                    style={styles.secondaryButton}
                  >
                    <Text style={{ color: theme.colors.textMuted }}>Back</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: rangeStart == null || rangeEnd == null }}
                    onPress={applyRange}
                    style={[
                      styles.primaryButton,
                      {
                        backgroundColor: theme.colors.primary,
                        borderRadius: theme.radius.md,
                        opacity: rangeStart == null || rangeEnd == null ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Text style={styles.primaryButtonText}>Apply</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  caret: { fontSize: 12, marginLeft: 8 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: { paddingVertical: 8 },
  list: { maxHeight: 360 },
  row: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  pane: { padding: 16, gap: 8 },
  paneTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '500' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  secondaryButton: { paddingVertical: 10, paddingHorizontal: 12 },
  primaryButton: { paddingVertical: 10, paddingHorizontal: 20 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
});
