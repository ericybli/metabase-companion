/**
 * Progress bar model.
 *
 * A progress card shows one value relative to a goal: a horizontal track with a
 * filled portion proportional to value/goal, value/goal/percent labels, and a
 * color that shifts when the goal is met or exceeded.
 *
 * Original implementation written from a behavior spec; no third-party code is
 * used. Pure functions only (no rendering) so the math/edge cases are unit
 * testable in isolation.
 */

import { type QueryColumn, type QueryResult } from '@/api/schemas';
import { formatValue, isNumericType } from '@/render/normalize';

/** Where the value sits relative to the goal. */
export type ProgressStatus = 'under' | 'met' | 'exceeded' | 'invalid';

/** The computed progress metrics handed to the renderer. */
export interface ProgressModel {
  /** Raw value (first row's metric), or null when missing/invalid. */
  value: number | null;
  /** Raw goal, or null when missing/invalid. */
  goal: number | null;
  /** Pre-formatted value label. */
  valueText: string;
  /** Pre-formatted goal label, e.g. "Goal 100" or "Goal: Not set". */
  goalText: string;
  /** Pre-formatted percent-of-goal label, e.g. "75%". */
  percentText: string;
  /** Fraction of the track that is filled, clamped to [0, 1]. */
  barPercent: number;
  /** Raw value/goal ratio (NOT clamped), or null when invalid. */
  ratio: number | null;
  /** Under / met / exceeded / invalid. */
  status: ProgressStatus;
  /** A short status message ("Goal met", "Goal exceeded", or ""). */
  message: string;
}

/** Coerce a raw cell to a finite number, or null when it isn't numeric. */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Clamp n into [0, 1]. */
export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Compute the bar fill fraction (clamped to [0, 1]) for a value vs. goal.
 *
 * - invalid value or goal (null/NaN, or goal < 0) → 0
 * - value >= goal (and goal > 0) → 1 (full bar)
 * - otherwise → value / goal, clamped to [0, 1]
 */
export function computeBarPercent(value: number | null, goal: number | null): number {
  if (value === null || goal === null) return 0;
  if (Number.isNaN(value) || Number.isNaN(goal) || goal < 0) return 0;
  if (goal === 0) return value > 0 ? 1 : 0;
  if (value >= goal) return 1;
  return clamp01(value / goal);
}

/**
 * Pick the metric (numeric) column for the progress value.
 *
 * Uses `progress.value` by name when present, else the first numeric column.
 */
function pickMetricColumn(
  result: QueryResult,
  vizSettings: Record<string, unknown>,
): { index: number; col: QueryColumn } | null {
  const { cols } = result;
  let index = -1;
  const fieldName = vizSettings['progress.value'];
  if (typeof fieldName === 'string') {
    index = cols.findIndex((c) => c.name === fieldName);
  }
  if (index < 0) {
    index = cols.findIndex((c) => isNumericType(c.baseType));
  }
  if (index < 0) index = 0;
  const col = cols[index];
  if (!col) return null;
  return { index, col };
}

/** Read the goal number from viz settings (`progress.goal`). */
function readGoal(vizSettings: Record<string, unknown>): number | null {
  if (!('progress.goal' in vizSettings)) return null;
  const raw = vizSettings['progress.goal'];
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build the progress model from a query result + viz settings.
 *
 * value = first row's metric; goal = Number(progress.goal) when present. When no
 * goal is configured we DON'T fabricate one — the bar shows empty and the goal
 * label reads "Goal: Not set".
 */
export function buildProgressModel(
  result: QueryResult,
  vizSettings: Record<string, unknown>,
): ProgressModel | null {
  const picked = pickMetricColumn(result, vizSettings);
  if (!picked) return null;
  const { index, col } = picked;

  const firstRow = result.rows[0];
  const value = firstRow ? toFiniteNumber(firstRow[index]) : null;
  const goal = readGoal(vizSettings);

  const hasValidValue = value !== null;
  const hasValidGoal = goal !== null && goal >= 0;

  let status: ProgressStatus;
  if (!hasValidValue || !hasValidGoal) {
    status = 'invalid';
  } else if (value === goal) {
    status = 'met';
  } else if (value > goal) {
    status = 'exceeded';
  } else {
    status = 'under';
  }

  const barPercent = computeBarPercent(value, goal);
  const ratio = hasValidValue && hasValidGoal && goal !== 0 ? value / goal : null;

  return {
    value,
    goal,
    valueText: hasValidValue ? formatValue(value, col) : 'No data',
    goalText: hasValidGoal ? `Goal ${formatValue(goal, col)}` : 'Goal: Not set',
    percentText: formatProgressPercent(ratio),
    barPercent,
    ratio,
    status,
    message: progressMessage(status),
  };
}

/** Format a value/goal ratio as a percent, e.g. 0.75 → "75%". */
export function formatProgressPercent(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return '';
  const pct = ratio * 100;
  const rounded = Math.round(pct * 100) / 100;
  const text = rounded.toFixed(2).replace(/\.?0+$/, '');
  return `${text}%`;
}

/** A short status message for a progress status (empty when below goal). */
export function progressMessage(status: ProgressStatus): string {
  switch (status) {
    case 'met':
      return 'Goal met';
    case 'exceeded':
      return 'Goal exceeded';
    default:
      return '';
  }
}
