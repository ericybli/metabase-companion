import React from 'react';
import { G, Line, Text as SvgText } from 'react-native-svg';
import { abbreviateNumber, valueToYRange, yAxisTicks, type PlotArea } from '@/render/chartScale';

/** Which physical side of the plot a y-axis is drawn on. */
export type YAxisSide = 'left' | 'right';

export interface ChartYAxisProps {
  /** Domain minimum (baseline; 0 unless the data dips negative). */
  min: number;
  /** Domain maximum. */
  max: number;
  /** Plot geometry the gridlines / labels are placed within. */
  plot: PlotArea;
  /** Gridline stroke color. */
  gridColor: string;
  /** Value-label text color. */
  labelColor: string;
  /** Desired number of ticks (defaults to the shared y-tick count). */
  tickCount?: number;
  /**
   * Which side this axis sits on. The left axis (default) draws full-width
   * gridlines with labels to the LEFT of the plot; the right axis draws labels
   * to the RIGHT of the plot and omits gridlines (the left axis already supplies
   * them) so the two axes never overlap.
   */
  side?: YAxisSide;
}

/**
 * A y-axis drawn as react-native-svg so it composes into the chart's <Svg>.
 *
 * The LEFT axis renders ~4-5 horizontal gridlines spanning the plot width with
 * an abbreviated value label at each tick (anchored to the left), from the
 * domain min (baseline) to the domain max.
 *
 * The RIGHT axis renders the same ticks but anchored to the RIGHT of the plot
 * and WITHOUT gridlines, so a dual-axis (auto-split) chart shows two independent
 * value scales — one per side — without doubling up the gridlines.
 */
export function ChartYAxis({
  min,
  max,
  plot,
  gridColor,
  labelColor,
  tickCount,
  side = 'left',
}: ChartYAxisProps): React.ReactElement {
  const ticks = yAxisTicks(min, max, tickCount);
  const isRight = side === 'right';
  const fill = labelColor;
  return (
    <G>
      {ticks.map((value, i) => {
        const y = valueToYRange(value, min, max, plot);
        return (
          <React.Fragment key={`ytick-${side}-${i}`}>
            {isRight ? null : (
              <Line
                x1={plot.innerLeft}
                y1={y}
                x2={plot.innerRight}
                y2={y}
                stroke={gridColor}
                strokeWidth={1}
                strokeOpacity={0.5}
              />
            )}
            <SvgText
              x={isRight ? plot.innerRight + 6 : plot.innerLeft - 6}
              y={y + 3}
              fontSize={9}
              fill={fill}
              textAnchor={isRight ? 'start' : 'end'}
            >
              {abbreviateNumber(value)}
            </SvgText>
          </React.Fragment>
        );
      })}
    </G>
  );
}
