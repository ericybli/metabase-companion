import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/ThemeProvider';

export interface DropdownProps {
  /** The selected option, or null when nothing is selected. */
  value: string | null;
  /** The selectable options. */
  options: string[];
  /** Called with the chosen option, or null when cleared. */
  onChange: (value: string | null) => void;
  /** Shown on the trigger when no value is set. Defaults to a localized "Select…". */
  placeholder?: string;
  /** When true, the open list shows a spinner instead of the options. */
  loading?: boolean;
  /** Notified when the list is opened (used to fetch backed values lazily). */
  onOpen?: () => void;
}

/**
 * A reusable, Expo-Go-safe dropdown built from plain React Native. Renders a
 * Pressable showing the current value (or placeholder); tapping opens a Modal
 * with a scrollable list of selectable options plus a "Clear" (none) row.
 * Selecting an option calls {@link DropdownProps.onChange} and closes the modal.
 * While {@link DropdownProps.loading} is true the open list shows a spinner.
 */
export function Dropdown({
  value,
  options,
  onChange,
  placeholder,
  loading,
  onOpen,
}: DropdownProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);

  function openList(): void {
    onOpen?.();
    setOpen(true);
  }

  function select(option: string | null): void {
    onChange(option);
    setOpen(false);
  }

  const triggerLabel = value ?? placeholder ?? t('dashboard.select');

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={openList}
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
          {triggerLabel}
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
            // Stop taps inside the sheet from closing the modal.
            onPress={() => {}}
          >
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : (
              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => select(null)}
                  style={[styles.row, { borderBottomColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.textMuted }}>{t('dashboard.clear')}</Text>
                </Pressable>
                {options.map((option, i) => {
                  const isSelected = option === value;
                  return (
                    <Pressable
                      key={`${option}-${i}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => select(option)}
                      style={[styles.row, { borderBottomColor: theme.colors.border }]}
                    >
                      <Text
                        style={{
                          color: isSelected ? theme.colors.primary : theme.colors.text,
                          fontWeight: isSelected ? '600' : '400',
                        }}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
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
  list: { maxHeight: 320 },
  loading: { padding: 24, alignItems: 'center' },
  row: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
});
