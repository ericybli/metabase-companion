import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import { CHART_HEIGHT, CHART_PALETTE } from '@/render/chartScale';
import { buildPieModel, type PieModel, type PieSlice } from '@/viz/model/pieModel';
import { buildPointSelectInfo, type PointSelectInfo } from '@/viz/drill/pointSelect';
import { useChartTooltip } from './ChartTooltip';
import type { QueryResult } from '@/api/schemas';

export interface PieChartViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  /** Chart height in px (defaults to {@link CHART_HEIGHT}). */
  height?: number;
  /**
   * Optional drill-through callback. When provided, tapping a slice or its
   * legend row reports the tapped point (slice index, dimension label, and the
   * slice's numeric value) IN ADDITION to toggling the in-chart selection, so a
   * dashboard can open a richer action sheet. Omitted -> only the selection is
   * affected.
   */
  onPointSelect?: (info: PointSelectInfo) => void;
}

/** SVG viewBox is a 100-unit square; the donut is centered. */
const VIEW = 100;
const CX = 50;
const CY = 50;
const OUTER_RADIUS = 46;
/** Donut hole: ~58% of the outer radius leaves room for the center total. */
const INNER_RADIUS = OUTER_RADIUS * 0.58;
/** Radius at which on-chart percent labels sit (mid-ring). */
const LABEL_RADIUS = (OUTER_RADIUS + INNER_RADIUS) / 2;

/** Point on a circle for an angle measured clockwise from 12 o'clock. */
function polar(angle: number, radius: number): { x: number; y: number } {
  return { x: CX + radius * Math.sin(angle), y: CY - radius * Math.cos(angle) };
}

/**
 * Build an SVG path for a donut band (annulus sector) between INNER_RADIUS and
 * OUTER_RADIUS, sweeping clockwise from startAngle to endAngle (radians, 0 at 12
 * o'clock). A full circle (span >= 2π) is drawn as two half-rings so the arc
 * endpoints never coincide.
 */
function bandPath(startAngle: number, endAngle: number): string {
  const span = endAngle - startAngle;
  if (span >= Math.PI * 2 - 1e-6) {
    const mid = startAngle + Math.PI;
    return [bandPath(startAngle, mid), bandPath(mid, endAngle)].join(' ');
  }
  const o0 = polar(startAngle, OUTER_RADIUS);
  const o1 = polar(endAngle, OUTER_RADIUS);
  const i1 = polar(endAngle, INNER_RADIUS);
  const i0 = polar(startAngle, INNER_RADIUS);
  const largeArc = span > Math.PI ? 1 : 0;
  return [
    `M ${o0.x} ${o0.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${o1.x} ${o1.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${i0.x} ${i0.y}`,
    'Z',
  ].join(' ');
}

/** A slice with its computed start/end angles for drawing. */
interface ArcSlice {
  slice: PieSlice;
  startAngle: number;
  endAngle: number;
  index: number;
}

/** Compute cumulative clockwise angles for each slice (share of 2π). */
function toArcs(model: PieModel): ArcSlice[] {
  const arcs: ArcSlice[] = [];
  let cursor = 0;
  model.slices.forEach((slice, index) => {
    const start = cursor;
    const end = cursor + slice.percent * Math.PI * 2;
    cursor = end;
    arcs.push({ slice, startAngle: start, endAngle: end, index });
  });
  return arcs;
}

/**
 * Pie / donut chart: single-series share-of-total. Each slice is a donut band
 * proportional to its percent of the (positive) total; small slices collapse into
 * a themed "Other" band via {@link buildPieModel}. On-chart percent labels appear
 * on large-enough slices; the donut center shows the formatted total. A legend
 * lists every slice (color swatch + label + value + percent) and is tappable —
 * tapping a slice (or its legend row) surfaces that slice's value and percent in
 * the center. Renders a themed "no data" message when there is no numeric series
 * or every value is non-positive.
 */
export function PieChartView({
  result,
  vizSettings,
  height = CHART_HEIGHT,
  onPointSelect,
}: PieChartViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const { selectedIndex, toggleIndex } = useChartTooltip();

  const model = useMemo(
    () => buildPieModel(result, vizSettings, CHART_PALETTE, theme.colors.textMuted),
    [result, vizSettings, theme.colors.textMuted],
  );

  if (!model || model.slices.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.noData, { color: theme.colors.textMuted }]}>{t('chart.noData')}</Text>
      </View>
    );
  }

  const arcs = toArcs(model);
  const pieSize = Math.max(120, height - 20);
  const selected = selectedIndex !== null ? (model.slices[selectedIndex] ?? null) : null;

  // A tap toggles the in-chart slice selection AND (when wired) reports the
  // point for the dashboard drill action sheet.
  const onSliceTap = (index: number): void => {
    toggleIndex(index);
    if (onPointSelect) {
      const labels = model.slices.map((s) => s.label);
      const series = [
        {
          name: model.metricName,
          values: model.slices.map((s) => s.value),
        },
      ];
      const info = buildPointSelectInfo(index, labels, series, model.dimension);
      if (info) {
        onPointSelect(info);
      }
    }
  };

  // Center caption: the selected slice's label/value/percent, else the total.
  const centerTop = selected ? selected.label : t('chart.pieTotal');
  const centerValue = selected ? selected.valueText : model.totalText;
  const centerSub = selected ? selected.percentText : null;

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {model.metricName}
      </Text>
      <View style={styles.pieRow}>
        <View style={{ width: pieSize, height: pieSize }}>
          <Svg width={pieSize} height={pieSize} viewBox={`0 0 ${VIEW} ${VIEW}`}>
            {arcs.map((arc) => {
              const isSel = selectedIndex === arc.index;
              return (
                <G key={`slice-${arc.index}`}>
                  <Path
                    testID={`pie-slice-${arc.index}`}
                    d={bandPath(arc.startAngle, arc.endAngle)}
                    fill={arc.slice.color}
                    stroke={theme.colors.background}
                    strokeWidth={isSel ? 1.5 : 1}
                    opacity={selectedIndex === null || isSel ? 1 : 0.45}
                    onPress={() => onSliceTap(arc.index)}
                  />
                  {arc.slice.showChartLabel ? (
                    <SvgText
                      x={polar((arc.startAngle + arc.endAngle) / 2, LABEL_RADIUS).x}
                      y={polar((arc.startAngle + arc.endAngle) / 2, LABEL_RADIUS).y + 2}
                      fontSize={6}
                      fontWeight="600"
                      fill={theme.colors.background}
                      textAnchor="middle"
                    >
                      {arc.slice.chartPercentText}
                    </SvgText>
                  ) : null}
                </G>
              );
            })}
          </Svg>
          {/* Center caption overlay (total, or the selected slice). */}
          <View style={styles.center} pointerEvents="none">
            <Text style={[styles.centerTop, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {centerTop}
            </Text>
            <Text style={[styles.centerValue, { color: theme.colors.text }]} numberOfLines={1}>
              {centerValue}
            </Text>
            {centerSub ? (
              <Text style={[styles.centerSub, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {centerSub}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.legend}>
          {model.slices.map((slice, i) => {
            const isSel = selectedIndex === i;
            return (
              <Pressable
                key={`legend-${i}`}
                testID={`pie-legend-${i}`}
                onPress={() => onSliceTap(i)}
                style={[styles.legendRow, isSel ? { backgroundColor: theme.colors.surface } : null]}
              >
                <View style={[styles.swatch, { backgroundColor: slice.color }]} />
                <Text style={[styles.legendLabel, { color: theme.colors.text }]} numberOfLines={1}>
                  {slice.label}
                </Text>
                <Text style={[styles.legendValue, { color: theme.colors.textMuted }]}>
                  {slice.valueText}
                </Text>
                <Text style={[styles.legendPercent, { color: theme.colors.textMuted }]}>
                  {slice.percentText}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8 },
  title: { fontSize: 12, fontWeight: '600', marginBottom: 4, paddingHorizontal: 4 },
  noData: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  pieRow: { flexDirection: 'row', alignItems: 'center' },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  centerTop: { fontSize: 11, fontWeight: '600' },
  centerValue: { fontSize: 18, fontWeight: '700' },
  centerSub: { fontSize: 11 },
  legend: { flex: 1, paddingLeft: 12 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  swatch: { width: 10, height: 10, borderRadius: 2, marginRight: 6 },
  legendLabel: { flex: 1, fontSize: 12 },
  legendValue: { fontSize: 12, marginLeft: 6 },
  legendPercent: { fontSize: 12, marginLeft: 8, minWidth: 40, textAlign: 'right' },
});
