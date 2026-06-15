import React from 'react';
import { G, Line, Text as SvgText } from 'react-native-svg';
import { abbreviateNumber, valueToYRange, yAxisTicks, type PlotArea } from '@/render/chartScale';

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
}

/**
 * Left y-axis: ~4-5 horizontal gridlines spanning the plot width with an
 * abbreviated value label at each tick, from the domain min (baseline) to the
 * domain max. Drawn as react-native-svg so it composes into the chart's <Svg>.
 */
export function ChartYAxis({
  min,
  max,
  plot,
  gridColor,
  labelColor,
  tickCount,
}: ChartYAxisProps): React.ReactElement {
  const ticks = yAxisTicks(min, max, tickCount);
  return (
    <G>
      {ticks.map((value, i) => {
        const y = valueToYRange(value, min, max, plot);
        return (
          <React.Fragment key={`ytick-${i}`}>
            <Line
              x1={plot.innerLeft}
              y1={y}
              x2={plot.innerRight}
              y2={y}
              stroke={gridColor}
              strokeWidth={1}
              strokeOpacity={0.5}
            />
            <SvgText
              x={plot.innerLeft - 6}
              y={y + 3}
              fontSize={9}
              fill={labelColor}
              textAnchor="end"
            >
              {abbreviateNumber(value)}
            </SvgText>
          </React.Fragment>
        );
      })}
    </G>
  );
}
