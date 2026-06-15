import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';

export interface DatePickerProps {
  /** The selected date as 'YYYY-MM-DD', or null when nothing is selected. */
  value: string | null;
  /** Called with the chosen date as a 'YYYY-MM-DD' string. */
  onChange: (yyyyMmDd: string) => void;
  /** Shown on the trigger when no value is set. */
  placeholder?: string;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

interface YearMonth {
  year: number;
  month: number; // 0-based
}

/** Two-digit zero pad for month/day formatting. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Format a year/month/day into a 'YYYY-MM-DD' string. */
function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

/** Parse a 'YYYY-MM-DD' string into its parts, or null when malformed. */
function parseIso(value: string | null): { year: number; month: number; day: number } | null {
  if (value == null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match == null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Days in the given (0-based) month, pure-JS (no calendar deps). */
function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this month.
  return new Date(year, month + 1, 0).getDate();
}

/** Weekday (0=Sun) of the first day of the given month. */
function firstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/** The visible month seeded from the current value, falling back to today. */
function initialMonth(value: string | null): YearMonth {
  const parsed = parseIso(value);
  if (parsed != null) return { year: parsed.year, month: parsed.month };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

/** Step a year/month one month forward (+1) or back (-1), wrapping the year. */
function stepMonth(ym: YearMonth, delta: number): YearMonth {
  const total = ym.year * 12 + ym.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/**
 * A reusable, Expo-Go-safe date picker built from plain React Native — no native
 * date modules. Renders a Pressable showing the current value (or placeholder);
 * tapping opens a Modal with a simple month calendar (prev/next month, a 7-column
 * day grid). Selecting a day calls {@link DatePickerProps.onChange} with a
 * 'YYYY-MM-DD' string and closes the modal.
 */
export function DatePicker({ value, onChange, placeholder }: DatePickerProps): React.ReactElement {
  const theme = useTheme();
  const [open, setOpen] = React.useState(false);
  const [visible, setVisible] = React.useState<YearMonth>(() => initialMonth(value));

  // Re-seed the visible month whenever the picker is (re)opened so it lands on
  // the currently-selected date.
  function openCalendar(): void {
    setVisible(initialMonth(value));
    setOpen(true);
  }

  function selectDay(day: number): void {
    onChange(toIso(visible.year, visible.month, day));
    setOpen(false);
  }

  const selected = parseIso(value);
  const total = daysInMonth(visible.year, visible.month);
  const leading = firstWeekday(visible.year, visible.month);
  // Grid cells: leading blanks then 1..total.
  const cells: (number | null)[] = [];
  for (let i = 0; i < leading; i += 1) cells.push(null);
  for (let d = 1; d <= total; d += 1) cells.push(d);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={openCalendar}
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
          style={{ color: value != null ? theme.colors.text : theme.colors.textMuted }}
          numberOfLines={1}
        >
          {value ?? placeholder ?? ''}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg },
            ]}
            // Stop taps inside the sheet from closing the modal.
            onPress={() => {}}
          >
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                onPress={() => setVisible((v) => stepMonth(v, -1))}
                hitSlop={8}
                style={styles.navButton}
              >
                <Text style={[styles.navText, { color: theme.colors.primary }]}>‹</Text>
              </Pressable>
              <Text style={[styles.title, { color: theme.colors.text }]}>
                {`${MONTH_NAMES[visible.month]} ${visible.year}`}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                onPress={() => setVisible((v) => stepMonth(v, 1))}
                hitSlop={8}
                style={styles.navButton}
              >
                <Text style={[styles.navText, { color: theme.colors.primary }]}>›</Text>
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAY_NAMES.map((w, i) => (
                <Text key={`wd-${i}`} style={[styles.weekday, { color: theme.colors.textMuted }]}>
                  {w}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((day, i) => {
                if (day == null) {
                  return <View key={`blank-${i}`} style={styles.cell} />;
                }
                const isSelected =
                  selected != null &&
                  selected.year === visible.year &&
                  selected.month === visible.month &&
                  selected.day === day;
                return (
                  <Pressable
                    key={`day-${day}`}
                    accessibilityRole="button"
                    onPress={() => selectDay(day)}
                    style={[
                      styles.cell,
                      isSelected && {
                        backgroundColor: theme.colors.primary,
                        borderRadius: theme.radius.sm,
                      },
                    ]}
                  >
                    <Text style={{ color: isSelected ? '#FFFFFF' : theme.colors.text }}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { borderWidth: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { paddingHorizontal: 12, paddingVertical: 4 },
  navText: { fontSize: 24, fontWeight: '600', lineHeight: 26 },
  title: { fontSize: 16, fontWeight: '600' },
  weekRow: { flexDirection: 'row' },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
