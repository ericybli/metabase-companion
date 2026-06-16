import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path, Polygon } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import { buildGaugeModel } from '@/viz/model/gaugeModel';
import type { QueryResult } from '@/api/schemas';

export interface GaugeViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  name: string;
}

/** SVG viewBox is a 100-unit square; the dial is centered slightly high. */
const VIEW = 100;
const CX = 50;
const CY = 52;
const OUTER_RADIUS = 45;
const INNER_RADIUS = OUTER_RADIUS * (3.7 / 5); // ≈ 33.3
const LABEL_RADIUS = OUTER_RADIUS * 1.13;
const NEEDLE_BASE = (OUTER_RADIUS - INNER_RADIUS) * 0.7; // half-width of needle base

/**
 * Rendered size of the SVG square overlay (px). The viewBox is 100 units, so the
 * scale from viewBox units to px is RENDER_SIZE / VIEW. The default
 * preserveAspectRatio (xMidYMid meet) keeps the drawing square and centered, so
 * the same transform positions the HTML/RN label overlays.
 */
const RENDER_SIZE = 200;
const SCALE = RENDER_SIZE / VIEW;
/** Half-size of an absolutely-positioned label box, used to center it. */
const LABEL_HALF = 14;

/**
 * Convert a dial angle (0 = straight up, clockwise positive) at radius r to an
 * SVG point. Using x = cx + r·sin θ, y = cy − r·cos θ keeps arcs, ticks, labels,
 * and the needle on one consistent convention.
 */
function polar(angle: number, radius: number): { x: number; y: number } {
  return { x: CX + radius * Math.sin(angle), y: CY - radius * Math.cos(angle) };
}

/**
 * Build an SVG path for a ring band (annulus sector) between innerR and outerR,
 * sweeping from startAngle to endAngle (radians, clockwise from straight-up).
 */
function bandPath(startAngle: number, endAngle: number, innerR: number, outerR: number): string {
  const o0 = polar(startAngle, outerR);
  const o1 = polar(endAngle, outerR);
  const i1 = polar(endAngle, innerR);
  const i0 = polar(startAngle, innerR);
  // sweepFlag 1 = clockwise (our angle increases clockwise on screen).
  const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
  return [
    `M ${o0.x} ${o0.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${o1.x} ${o1.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${i0.x} ${i0.y}`,
    'Z',
  ].join(' ');
}

/**
 * Build the needle polygon: an isosceles triangle whose tip sits near the inner
 * arc at the value's angle and whose base straddles the dial center.
 */
function needlePoints(angle: number): string {
  const tip = polar(angle, INNER_RADIUS - 1);
  // Base corners are perpendicular to the needle direction, around the center.
  const left = { x: CX + NEEDLE_BASE * Math.cos(angle), y: CY + NEEDLE_BASE * Math.sin(angle) };
  const right = { x: CX - NEEDLE_BASE * Math.cos(angle), y: CY - NEEDLE_BASE * Math.sin(angle) };
  return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

/**
 * Gauge: a 270° dial showing one numeric value (first row's metric) within a set
 * of colored segment ranges. Each segment is a colored arc; a needle points at
 * the value's position; boundary numbers sit just outside the arc; the formatted
 * value sits in the center. Segments come from `gauge.segments`; when absent, a
 * single 0..(nice max) segment is synthesized.
 *
 * Renders a themed "no data" message when there is no numeric column or no rows.
 */
export function GaugeView({ result, vizSettings }: GaugeViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();

  const model = buildGaugeModel(result, vizSettings);

  if (!model) {
    return (
      <View style={styles.container}>
        <Text style={[styles.noData, { color: theme.colors.textMuted }]}>{t('chart.noData')}</Text>
      </View>
    );
  }

  const firstSeg = model.segments[0];
  const lastSeg = model.segments[model.segments.length - 1];

  return (
    <View style={styles.container}>
      <View style={[styles.dial, { width: RENDER_SIZE, height: RENDER_SIZE }]}>
        <Svg width={RENDER_SIZE} height={RENDER_SIZE} viewBox={`0 0 ${VIEW} ${VIEW}`}>
          {/* Background track behind all segments. */}
          <Path
            d={bandPath(
              firstSeg?.startAngle ?? 0,
              lastSeg?.endAngle ?? 0,
              INNER_RADIUS,
              OUTER_RADIUS,
            )}
            fill={theme.colors.border}
          />
          {/* Colored segment arcs. */}
          {model.segments.map((seg, i) => (
            <Path
              key={`seg-${i}`}
              d={bandPath(seg.startAngle, seg.endAngle, INNER_RADIUS, OUTER_RADIUS)}
              fill={seg.color}
            />
          ))}
          {/* Needle / value marker. */}
          <Polygon
            points={needlePoints(model.needleAngle)}
            fill={theme.colors.text}
            stroke={theme.colors.background}
            strokeWidth={0.75}
          />
        </Svg>

        {/* Boundary tick labels, overlaid just outside the arc. */}
        {model.boundaries.map((b, i) => {
          const p = polar(b.angle, LABEL_RADIUS);
          return (
            <Text
              key={`bound-${i}`}
              style={[
                styles.boundary,
                {
                  color: theme.colors.textMuted,
                  left: p.x * SCALE - LABEL_HALF,
                  top: p.y * SCALE - 6,
                },
              ]}
              numberOfLines={1}
            >
              {b.text}
            </Text>
          );
        })}

        {/* Center value. */}
        <View style={[styles.center, { top: CY * SCALE }]} pointerEvents="none">
          <Text style={[styles.value, { color: theme.colors.text }]} numberOfLines={1}>
            {model.valueText}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' },
  dial: { position: 'relative' },
  boundary: {
    position: 'absolute',
    width: LABEL_HALF * 2,
    textAlign: 'center',
    fontSize: 11,
  },
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  value: { fontSize: 26, fontWeight: '700' },
  noData: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
});
