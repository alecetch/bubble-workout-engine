import type { ExerciseHistoryPoint } from "../../api/history";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type ChartPoint = {
  x: number;
  y: number;
  outcome: string | null;
  date: string;
};

export type ChartLayout = {
  svgPath: string;
  markers: { cx: number; cy: number; outcome: string | null }[];
  points: ChartPoint[];
  padding: { top: number; bottom: number; left: number; right: number };
  plotW: number;
  plotH: number;
  minVal: number;
  maxVal: number;
};

export function formatShortDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return "";
  const month = MONTH_LABELS[Number(match[2]) - 1];
  const day = Number(match[3]);
  if (!month || !Number.isFinite(day)) return "";
  return `${month} ${day}`;
}

export function buildChartPath(
  series: ExerciseHistoryPoint[],
  chartWidth: number,
  chartHeight: number,
): ChartLayout {
  const valid = series.filter((point) => point.estimatedE1rmKg != null);
  const padding = { top: 16, bottom: 32, left: 44, right: 8 };
  const plotW = chartWidth - padding.left - padding.right;
  const plotH = chartHeight - padding.top - padding.bottom;
  if (valid.length === 0) {
    return {
      svgPath: "",
      markers: [],
      points: [],
      padding,
      plotW,
      plotH,
      minVal: 0,
      maxVal: 0,
    };
  }

  const values = valid.map((point) => point.estimatedE1rmKg as number);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  if (valid.length === 1) {
    const cx = padding.left + plotW / 2;
    const cy = padding.top + plotH / 2;
    return {
      svgPath: "",
      markers: [{ cx, cy, outcome: valid[0].decisionOutcome }],
      points: [{ x: cx, y: cy, outcome: valid[0].decisionOutcome, date: valid[0].date }],
      padding,
      plotW,
      plotH,
      minVal,
      maxVal,
    };
  }

  const toX = (index: number) => padding.left + (index / (valid.length - 1)) * plotW;
  const toY = (value: number) => padding.top + plotH - ((value - minVal) / range) * plotH;

  const points = valid.map((point, index) => ({
    x: toX(index),
    y: toY(point.estimatedE1rmKg as number),
    outcome: point.decisionOutcome,
    date: point.date,
  }));

  const svgPath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");

  return {
    svgPath,
    markers: points.map((point) => ({
      cx: point.x,
      cy: point.y,
      outcome: point.outcome,
    })),
    points,
    padding,
    plotW,
    plotH,
    minVal,
    maxVal,
  };
}
