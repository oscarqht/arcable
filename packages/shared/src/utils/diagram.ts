import { DiagramConfig, DiagramDataPoint, DiagramChartStyle } from '../types/workspace';

export const DIAGRAM_PALETTES: Record<string, string[]> = {
  vibrant: ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6'],
  ocean: ['#0284c7', '#38bdf8', '#0ea5e9', '#06b6d4', '#64748b', '#0369a1'],
  emerald: ['#059669', '#10b981', '#34d399', '#6ee7b7', '#047857', '#0f766e'],
  sunset: ['#f43f5e', '#fb7185', '#fb923c', '#f59e0b', '#e11d48', '#ea580c'],
  slate: ['#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#1e293b'],
};

export const DEFAULT_DIAGRAM_DATA_POINTS: DiagramDataPoint[] = [
  { id: 'dp-1', label: 'Mon', value: 16 },
  { id: 'dp-2', label: 'Tue', value: 28 },
  { id: 'dp-3', label: 'Wed', value: 22 },
  { id: 'dp-4', label: 'Thu', value: 42 },
  { id: 'dp-5', label: 'Fri', value: 35 },
];

export const DIAGRAM_PRESET_TEMPLATES: Array<{
  name: string;
  chartStyle: DiagramChartStyle;
  dataPoints: DiagramDataPoint[];
  colorScheme: 'vibrant' | 'ocean' | 'emerald' | 'sunset' | 'slate';
}> = [
  {
    name: 'Weekly Activity',
    chartStyle: 'bar',
    colorScheme: 'vibrant',
    dataPoints: [
      { id: 'w-1', label: 'Mon', value: 18 },
      { id: 'w-2', label: 'Tue', value: 32 },
      { id: 'w-3', label: 'Wed', value: 25 },
      { id: 'w-4', label: 'Thu', value: 45 },
      { id: 'w-5', label: 'Fri', value: 38 },
      { id: 'w-6', label: 'Sat', value: 20 },
      { id: 'w-7', label: 'Sun', value: 12 },
    ],
  },
  {
    name: 'Trend / Growth',
    chartStyle: 'area',
    colorScheme: 'ocean',
    dataPoints: [
      { id: 't-1', label: 'Jan', value: 24 },
      { id: 't-2', label: 'Feb', value: 36 },
      { id: 't-3', label: 'Mar', value: 42 },
      { id: 't-4', label: 'Apr', value: 58 },
      { id: 't-5', label: 'May', value: 72 },
    ],
  },
  {
    name: 'Browser Share',
    chartStyle: 'doughnut',
    colorScheme: 'vibrant',
    dataPoints: [
      { id: 'b-1', label: 'Chrome', value: 64 },
      { id: 'b-2', label: 'Safari', value: 19 },
      { id: 'b-3', label: 'Edge', value: 7 },
      { id: 'b-4', label: 'Firefox', value: 5 },
      { id: 'b-5', label: 'Other', value: 5 },
    ],
  },
  {
    name: 'Task Status',
    chartStyle: 'pie',
    colorScheme: 'emerald',
    dataPoints: [
      { id: 's-1', label: 'Done', value: 16 },
      { id: 's-2', label: 'In Progress', value: 8 },
      { id: 's-3', label: 'Review', value: 4 },
      { id: 's-4', label: 'Backlog', value: 6 },
    ],
  },
];

export function createDefaultDiagramConfig(): DiagramConfig {
  return {
    title: 'Metrics',
    chartStyle: 'bar',
    colorScheme: 'vibrant',
    dataPoints: [...DEFAULT_DIAGRAM_DATA_POINTS],
    unit: '',
  };
}

export function getDataPointColor(
  point: DiagramDataPoint,
  index: number,
  scheme: string = 'vibrant'
): string {
  if (point.color && point.color.trim()) {
    return point.color.trim();
  }
  const palette = DIAGRAM_PALETTES[scheme] || DIAGRAM_PALETTES.vibrant;
  return palette[index % palette.length];
}

/**
 * Calculates SVG slice path for Pie and Doughnut sectors
 */
export interface PieSlice {
  point: DiagramDataPoint;
  index: number;
  color: string;
  startAngle: number;
  endAngle: number;
  pathD: string;
  percentage: number;
  centerAngle: number;
}

export function computePieSlices(
  points: DiagramDataPoint[],
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number = 0,
  scheme: string = 'vibrant'
): PieSlice[] {
  const sanitized = points.map((p) => ({
    ...p,
    value: Math.max(0, Number(p.value) || 0),
  }));
  const total = sanitized.reduce((acc, p) => acc + p.value, 0);

  if (total <= 0) {
    return [];
  }

  let currentAngle = -Math.PI / 2; // start at top (12 o'clock)
  const slices: PieSlice[] = [];

  sanitized.forEach((point, index) => {
    if (point.value <= 0) return;
    const fraction = point.value / total;
    const angleSpan = fraction * 2 * Math.PI;
    const endAngle = currentAngle + angleSpan;
    const centerAngle = currentAngle + angleSpan / 2;
    const color = getDataPointColor(point, index, scheme);

    // Handle full 360 circle case safely without degenerate arc
    if (fraction >= 0.9999) {
      if (innerRadius <= 0) {
        // Full solid circle
        slices.push({
          point,
          index,
          color,
          startAngle: currentAngle,
          endAngle,
          centerAngle,
          percentage: 100,
          pathD: `M ${cx} ${cy - outerRadius} A ${outerRadius} ${outerRadius} 0 1 0 ${cx} ${cy + outerRadius} A ${outerRadius} ${outerRadius} 0 1 0 ${cx} ${cy - outerRadius} Z`,
        });
      } else {
        // Full donut ring
        slices.push({
          point,
          index,
          color,
          startAngle: currentAngle,
          endAngle,
          centerAngle,
          percentage: 100,
          pathD: `M ${cx} ${cy - outerRadius} A ${outerRadius} ${outerRadius} 0 1 0 ${cx} ${cy + outerRadius} A ${outerRadius} ${outerRadius} 0 1 0 ${cx} ${cy - outerRadius} M ${cx} ${cy - innerRadius} A ${innerRadius} ${innerRadius} 0 1 1 ${cx} ${cy + innerRadius} A ${innerRadius} ${innerRadius} 0 1 1 ${cx} ${cy - innerRadius} Z`,
        });
      }
      currentAngle = endAngle;
      return;
    }

    const x1 = cx + outerRadius * Math.cos(currentAngle);
    const y1 = cy + outerRadius * Math.sin(currentAngle);
    const x2 = cx + outerRadius * Math.cos(endAngle);
    const y2 = cy + outerRadius * Math.sin(endAngle);

    const largeArcFlag = angleSpan > Math.PI ? 1 : 0;

    let pathD = '';
    if (innerRadius <= 0) {
      // Standard pie slice to center
      pathD = `M ${cx} ${cy} L ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
    } else {
      // Donut segment
      const ix1 = cx + innerRadius * Math.cos(endAngle);
      const iy1 = cy + innerRadius * Math.sin(endAngle);
      const ix2 = cx + innerRadius * Math.cos(currentAngle);
      const iy2 = cy + innerRadius * Math.sin(currentAngle);
      pathD = `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${ix2} ${iy2} Z`;
    }

    slices.push({
      point,
      index,
      color,
      startAngle: currentAngle,
      endAngle,
      centerAngle,
      percentage: Math.round(fraction * 100),
      pathD,
    });

    currentAngle = endAngle;
  });

  return slices;
}
