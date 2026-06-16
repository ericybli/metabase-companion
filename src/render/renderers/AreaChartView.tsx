import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/ui/ThemeProvider';
import {
  buildAreaPathToBaseline,
  CHART_HEIGHT,
  DEFAULT_CHART_WIDTH,
  getCategoryBands,
  getLinePointsForDomain,
  getPlotArea,
  pickAxisLabelIndices,
  pointsToString,
  splitLineSegments,
  truncateLabel,
  valueToYRange,
} from '@/render/chartScale';
import { buildCartesianModel } from '@/viz/model/cartesianModel';
import { buildPointSelectInfo, type PointSelectInfo } from '@/viz/drill/pointSelect';
import { ChartLegend } from './ChartLegend';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import { ChartYAxis } from './ChartYAxis';
import { useHiddenSeries } from './useHiddenSeries';
import type { QueryResult } from '@/api/schemas';

export interface AreaChartViewProps {
  result: QueryResult;
  vizSettings: Record<string, unknown>;
  /** Chart height in px (defaults to {@link CHART_HEIGHT}). */
  height?: number;
  /**
   * Optional drill-through callback. When provided, tapping a point reports the
   * tapped point (its index, x label, and each visible series' value) IN ADDITION
   * to toggling the in-chart tooltip, so a dashboard can open a richer action
   * sheet. Omitted -> only the tooltip is affected.
   */
  onPointSelect?: (info: PointSelectInfo) => void;
}

/**
 * Area chart driven by the dual-axis cartesian model. Each VISIBLE series fills
 * a semi-transparent <Path> down to its axis baseline, plus the line and dots,
 * in its model-assigned palette color and scaled to ITS axis (left or right). A
 * LEFT y-axis is always drawn; when the model auto-splits (`hasSplit`) a RIGHT
 * y-axis with its own domain + abbreviated labels is drawn too. The legend
 * (multi-series) is tappable: hiding a series recomputes the model from the
 * visible series so the axes rescale. Renders a themed "no data" message when
 * there is nothing to plot.
 */
export function AreaChartView({
  result,
  vizSettings,
  height = CHART_HEIGHT,
  onPointSelect,
}: AreaChartViewProps): React.ReactElement {
  const theme = useTheme();
  const { t } = useTranslation();
  const [width, setWidth] = useState(DEFAULT_CHART_WIDTH);
  const { selectedIndex, toggleIndex, clear } = useChartTooltip();

  const baseModel = useMemo(
    () => buildCartesianModel(result, vizSettings, {}),
    [result, vizSettings],
  );
  const seriesCount = baseModel?.series.length ?? 0;
  const { hidden, toggle } = useHiddenSeries(seriesCount);

  const hiddenSeries = useMemo(
    () => hidden.map((h, i) => (h ? i : -1)).filter((i) => i >= 0),
    [hidden],
  );
  const model = useMemo(
    () => buildCartesianModel(result, vizSettings, { hiddenSeries }) ?? baseModel,
    [result, vizSettings, hiddenSeries, baseModel],
  );

  if (!model || model.series.length === 0 || model.labels.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.noData, { color: theme.colors.textMuted }]}>{t('chart.noData')}</Text>
      </View>
    );
  }

  const onLayout = (e: LayoutChangeEvent): void => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - width) > 1) {
      setWidth(w);
    }
  };

  const plot = getPlotArea(width, height, model.hasSplit);
  const left = model.left ?? { min: 0, max: 1 };
  const right = model.right;
  // Thin out the x-axis labels so they don't overlap; points stay one-per-value.
  const labelIndices = pickAxisLabelIndices(model.labels.length);
  const multi = model.series.length > 1;
  // One full-height transparent touch band per point for tap-for-value.
  const touchBands = getCategoryBands(model.labels.length, plot);
  const anchorX =
    selectedIndex !== null ? (touchBands[selectedIndex]?.centerX ?? plot.innerLeft) : 0;

  // A tap toggles the in-chart tooltip AND (when wired) reports the point for
  // the dashboard drill action sheet.
  const onTouch = (index: number): void => {
    toggleIndex(index);
    if (onPointSelect) {
      const info = buildPointSelectInfo(index, model.labels, model.series, model.dimension);
      if (info) {
        onPointSelect(info);
      }
    }
  };

  return (
    <View style={styles.container} onLayout={onLayout}>
      {!multi ? (
        <Text style={[styles.title, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {model.series[0]?.name ?? ''}
        </Text>
      ) : null}
      {multi ? (
        <ChartLegend
          names={model.series.map((s) => s.name)}
          colorAt={(i) => model.series[i]?.color ?? theme.colors.primary}
          hidden={hidden}
          onToggle={toggle}
        />
      ) : null}
      <View>
        <Svg width={width} height={height}>
          {/* Background tap target — clears the tooltip when tapping empty space. */}
          <Rect
            x={plot.innerLeft}
            y={plot.innerTop}
            width={plot.innerWidth}
            height={plot.innerBottom - plot.innerTop}
            fill="transparent"
            onPress={clear}
          />
          <ChartYAxis
            min={left.min}
            max={left.max}
            plot={plot}
            gridColor={theme.colors.border}
            labelColor={theme.colors.textMuted}
            side="left"
          />
          {model.hasSplit && right ? (
            <ChartYAxis
              min={right.min}
              max={right.max}
              plot={plot}
              gridColor={theme.colors.border}
              labelColor={theme.colors.textMuted}
              side="right"
            />
          ) : null}
          {model.series.map((s, si) => {
            if (s.hidden) {
              return null;
            }
            const domain = s.axis === 'right' && right ? right : left;
            // Fill down to the domain's zero baseline (clamped into the domain).
            const baselineY = valueToYRange(
              Math.min(Math.max(0, domain.min), domain.max),
              domain.min,
              domain.max,
              plot,
            );
            const points = getLinePointsForDomain(s.values, plot, domain.min, domain.max);
            const segments = splitLineSegments(points);
            return (
              <React.Fragment key={`series-${si}`}>
                {segments.map((seg, segi) =>
                  seg.length > 1 ? (
                    <Path
                      key={`area-${si}-${segi}`}
                      d={buildAreaPathToBaseline(seg, baselineY)}
                      fill={s.color}
                      fillOpacity={0.25}
                      stroke="none"
                    />
                  ) : null,
                )}
                {segments.map((seg, segi) =>
                  seg.length > 1 ? (
                    <Polyline
                      key={`seg-${si}-${segi}`}
                      points={pointsToString(seg)}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ) : null,
                )}
                {segments.flatMap((seg, segi) =>
                  seg.map((p, i) => (
                    <Circle key={`dot-${si}-${segi}-${i}`} cx={p.x} cy={p.y} r={3} fill={s.color} />
                  )),
                )}
              </React.Fragment>
            );
          })}
          {labelIndices.map((i) => (
            <SvgText
              key={`label-${i}`}
              x={touchBands[i]?.centerX ?? plot.innerLeft}
              y={plot.innerBottom + 16}
              fontSize={9}
              fill={theme.colors.textMuted}
              textAnchor="middle"
            >
              {truncateLabel(model.labels[i] ?? '')}
            </SvgText>
          ))}
          {touchBands.map((band) => (
            <Rect
              key={`touch-${band.index}`}
              testID={`chart-touch-${band.index}`}
              accessibilityLabel={model.labels[band.index] ?? String(band.index)}
              x={band.x}
              y={plot.innerTop}
              width={band.width}
              height={plot.innerBottom - plot.innerTop}
              fill="transparent"
              onPress={() => onTouch(band.index)}
            />
          ))}
        </Svg>
        <ChartTooltip
          labels={model.labels}
          series={model.series}
          selectedIndex={selectedIndex}
          anchorX={anchorX}
          width={width}
          hidden={hidden}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8 },
  title: { fontSize: 12, fontWeight: '600', marginBottom: 4, paddingHorizontal: 4 },
  noData: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
});
