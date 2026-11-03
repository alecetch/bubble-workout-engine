import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";

type Props = {
  year: number;
  trainingDates: string[];
  todayLocal: string;
  windowStart?: string;
  onDayPress?: (date: string) => void;
  presentation?: "screen" | "share";
};
const DAY_MS = 86_400_000;
const GAP = 2;
const MIN_CELL = 4;
const LABEL_HEIGHT = 18;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const YearHeatmap = React.memo(function YearHeatmap({ year, trainingDates, todayLocal, windowStart, onDayPress, presentation = "screen" }: Props): React.JSX.Element {
  const window = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const availableWidth = measuredWidth || Math.max(1, (window.width || 360) - spacing.lg * 2);
  const scrollRef = useRef<ScrollView>(null);
  const calendar = useMemo(() => {
    const start = Date.UTC(year, 0, 1);
    const days = (Date.UTC(year + 1, 0, 1) - start) / DAY_MS;
    const offset = (new Date(start).getUTCDay() + 6) % 7;
    const columns = Math.ceil((days + offset) / 7);
    const trained = new Set(trainingDates);
    const monthCounts = Array<number>(12).fill(0);
    const weeks = Array.from({ length: columns }, () => [] as Array<{ date: string; row: number; state: "trained" | "future" | "untrained" }>);
    for (let day = 0; day < days; day++) {
      const date = new Date(start + day * DAY_MS).toISOString().slice(0, 10);
      if (windowStart && date < windowStart) continue;
      const state = date > todayLocal ? "future" : trained.has(date) ? "trained" : "untrained";
      if (state === "trained") monthCounts[Number(date.slice(5, 7)) - 1]++;
      weeks[Math.floor((day + offset) / 7)].push({ date, row: (day + offset) % 7, state });
    }
    const count = monthCounts.reduce((sum, value) => sum + value, 0);
    const best = Math.max(...monthCounts);
    const summary = `${count} training ${count === 1 ? "day" : "days"} in ${year}${best ? `; best month ${MONTHS[monthCounts.indexOf(best)]} with ${best}` : ""}`;
    const months = MONTHS.map((name, month) => ({ name,
      column: Math.floor(((Date.UTC(year, month, 1) - start) / DAY_MS + offset) / 7) }));
    return { weeks, columns, months, summary, start, days, offset };
  }, [year, trainingDates, todayLocal, windowStart]);
  const cell = Math.max(MIN_CELL, Math.min(10, (availableWidth + GAP) / calendar.columns - GAP));
  const step = cell + GAP;
  const width = calendar.columns * step - GAP;
  const height = LABEL_HEIGHT + 7 * step;
  const scrollToCurrentWeek = useCallback(() => {
    if (!measuredWidth || width <= availableWidth) return;
    const day = Math.max(0, Math.min(calendar.days - 1, (Date.parse(todayLocal) - calendar.start) / DAY_MS));
    const column = Math.floor((day + calendar.offset) / 7);
    scrollRef.current?.scrollTo({ x: Math.max(0, Math.min(width - availableWidth, column * step - availableWidth / 2)), animated: false });
  }, [measuredWidth, width, availableWidth, calendar, todayLocal, step]);
  useEffect(() => { if (presentation === "screen") scrollToCurrentWeek(); }, [scrollToCurrentWeek, presentation]);

  if (presentation === "share") {
    // Three static rows retain every week without a clipped horizontal scroll view.
    const columns = 18;
    const size = 10;
    const stride = size + GAP;
    const panelHeight = LABEL_HEIGHT + 7 * stride + 12;
    const rows = Math.ceil(calendar.columns / columns);
    return <View accessible accessibilityRole="image" accessibilityLabel={calendar.summary} testID="year-heatmap">
      <Svg width={columns * stride - GAP} height={rows * panelHeight - 12} accessible={false}>
        {calendar.months.map(month => <SvgText key={month.name} x={(month.column % columns) * stride}
          y={Math.floor(month.column / columns) * panelHeight + 12} fontSize={9} fill={colors.textSecondary}>{month.name.slice(0, 3)}</SvgText>)}
        {calendar.weeks.map((week, column) => <G key={column} testID={`year-week-${column}`}
          transform={`translate(${(column % columns) * stride},${Math.floor(column / columns) * panelHeight})`}>
          {week.map(day => <Rect key={day.date} testID={`year-day-${day.date}`} x={0} y={LABEL_HEIGHT + day.row * stride}
            width={size} height={size} rx={1} accessible={false}
            fill={day.state === "future" ? "none" : day.state === "trained" ? colors.accent : colors.border}
            stroke={day.state === "future" ? colors.textSecondary : "none"} strokeWidth={0.7} />)}
        </G>)}
      </Svg>
    </View>;
  }

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={calendar.summary} testID="year-heatmap"
      onLayout={event => { const next = event.nativeEvent.layout.width; if (next > 0) setMeasuredWidth(next); }}>
      <ScrollView ref={scrollRef} horizontal scrollEnabled={width > availableWidth} showsHorizontalScrollIndicator={width > availableWidth}
        onContentSizeChange={scrollToCurrentWeek} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} accessible={false}>
          {calendar.months.map(month => <SvgText key={month.name} x={month.column * step} y={12}
            fontSize={9} fill={colors.textSecondary}>{month.name.slice(0, 3)}</SvgText>)}
          {calendar.weeks.map((week, column) => (
            <G key={column} testID={`year-week-${column}`}>
              {week.map(day => <Rect key={day.date} testID={`year-day-${day.date}`} x={column * step} y={LABEL_HEIGHT + day.row * step}
                width={cell} height={cell} rx={1} accessible={false}
                fill={day.state === "future" ? "none" : day.state === "trained" ? colors.accent : colors.border}
                stroke={day.state === "future" ? colors.textSecondary : "none"} strokeWidth={0.7}
                onPress={onDayPress ? () => onDayPress(day.date) : undefined} />)}
            </G>
          ))}
        </Svg>
      </ScrollView>
    </View>
  );
});
