import type {
  ComparisonMetric,
  ComparisonSeries,
  DiagramTone,
  FlowStep,
  FunnelStage,
  TimelineItem,
} from '../../core/types';
import type { PaperContentTheme } from './PaperContentFrame';

interface TonePalette {
  background: string;
  border: string;
  text: string;
  fill: string;
}

function palette(theme: PaperContentTheme, tone: DiagramTone = 'neutral'): TonePalette {
  switch (tone) {
    case 'info':
      return { background: theme.linkBackground, border: theme.linkBorder, text: theme.linkText, fill: theme.linkText };
    case 'success':
      return { background: '#ecfdf5', border: '#a7f3d0', text: '#047857', fill: '#10b981' };
    case 'warning':
      return { background: '#fffbeb', border: '#fde68a', text: '#b45309', fill: '#f59e0b' };
    case 'danger':
      return { background: '#fef2f2', border: '#fecaca', text: '#b91c1c', fill: '#ef4444' };
    default:
      return { background: theme.surfaceRaised, border: theme.divider, text: theme.text, fill: theme.mutedText };
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatMetric(metric: ComparisonMetric, value: number): string {
  switch (metric.format) {
    case 'percent': return `${(value * 100).toFixed(1)}%`;
    case 'duration-ms':
      if (value < 1000) return `${Math.round(value)}ms`;
      if (value < 60_000) return `${(value / 1000).toFixed(1)}s`;
      return `${(value / 60_000).toFixed(1)}m`;
    default: return formatNumber(value);
  }
}

function Arrow({ direction, color }: { direction: 'horizontal' | 'vertical'; color: string }) {
  if (direction === 'vertical') {
    return <div aria-hidden style={{ textAlign: 'center', color, fontSize: 18, lineHeight: 1 }}>↓</div>;
  }
  return <div aria-hidden style={{ color, fontSize: 18, lineHeight: 1, alignSelf: 'center' }}>→</div>;
}

export function FlowDiagram({
  steps,
  direction = 'horizontal',
  theme,
}: {
  steps: FlowStep[];
  direction?: 'horizontal' | 'vertical';
  theme: PaperContentTheme;
}) {
  const vertical = direction === 'vertical';
  return (
    <div
      data-testid="structured-flow"
      style={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: vertical ? 'stretch' : 'flex-start',
        gap: 8,
        overflowX: vertical ? undefined : 'auto',
        paddingBottom: vertical ? 0 : 4,
      }}
    >
      {steps.map((step, index) => {
        const colors = palette(theme, step.tone);
        return (
          <div key={step.id} style={{ display: 'contents' }}>
            <div style={{ minWidth: vertical ? undefined : 150, flex: 1 }}>
              <div style={{ border: `1px solid ${colors.border}`, borderRadius: 10, background: colors.background, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <strong style={{ color: colors.text, fontSize: '0.78rem', lineHeight: 1.35 }}>{step.title}</strong>
                  {step.value && <span style={{ color: colors.text, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{step.value}</span>}
                </div>
                {step.description && <p style={{ color: theme.mutedText, fontSize: '0.68rem', lineHeight: 1.45, margin: '5px 0 0' }}>{step.description}</p>}
              </div>
              {step.branches && step.branches.length > 0 && (
                <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                  {step.branches.map((branch, branchIndex) => {
                    const branchColors = palette(theme, branch.tone ?? 'danger');
                    return (
                      <div key={`${branch.label}-${branchIndex}`} style={{ borderLeft: `2px solid ${branchColors.border}`, padding: '4px 7px', background: branchColors.background, borderRadius: 4, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ color: branchColors.text, fontSize: '0.62rem' }}>{branch.label}</span>
                        {branch.value && <strong style={{ color: branchColors.text, fontSize: '0.62rem' }}>{branch.value}</strong>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {index < steps.length - 1 && <Arrow direction={direction} color={theme.mutedText} />}
          </div>
        );
      })}
    </div>
  );
}

export function FunnelDiagram({ stages, total, theme }: { stages: FunnelStage[]; total?: number; theme: PaperContentTheme }) {
  const denominator = Math.max(total ?? stages[0]?.value ?? 0, 1);
  return (
    <div data-testid="structured-funnel" style={{ display: 'grid', gap: 8 }}>
      {stages.map((stage, index) => {
        const colors = palette(theme, stage.tone);
        const width = Math.max(8, Math.min(100, (stage.value / denominator) * 100));
        return (
          <div key={`${stage.label}-${index}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 3, fontSize: '0.66rem' }}>
              <span style={{ color: theme.text, fontWeight: 600 }}>{stage.label}</span>
              <span style={{ color: theme.mutedText }}>{formatNumber(stage.value)} · {((stage.value / denominator) * 100).toFixed(1)}%</span>
            </div>
            <div style={{ height: 26, borderRadius: 6, background: theme.surfaceAlt, padding: 3 }}>
              <div style={{ height: '100%', width: `${width}%`, minWidth: 36, borderRadius: 4, background: colors.fill, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 7px', boxSizing: 'border-box', fontSize: '0.62rem', fontWeight: 700 }}>
                {formatNumber(stage.value)}
              </div>
            </div>
            {stage.description && <p style={{ color: theme.mutedText, fontSize: '0.6rem', margin: '3px 0 0' }}>{stage.description}</p>}
          </div>
        );
      })}
    </div>
  );
}

function numericTime(value: number | string): number {
  if (typeof value === 'number') return value;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return date;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function TimelineDiagram({ items, theme }: { items: TimelineItem[]; theme: PaperContentTheme }) {
  const normalized = items.map((item) => {
    const start = numericTime(item.start);
    const end = item.end === undefined ? start : numericTime(item.end);
    return { item, start: Math.min(start, end), end: Math.max(start, end) };
  });
  const min = normalized.length > 0 ? Math.min(...normalized.map((entry) => entry.start)) : 0;
  const max = normalized.length > 0 ? Math.max(...normalized.map((entry) => entry.end), min + 1) : 1;
  const span = Math.max(max - min, 1);

  return (
    <div data-testid="structured-timeline" style={{ display: 'grid', gap: 9 }}>
      {normalized.map(({ item, start, end }, index) => {
        const colors = palette(theme, item.tone ?? 'info');
        const left = ((start - min) / span) * 100;
        const width = Math.max(4, ((Math.max(end - start, span * 0.01)) / span) * 100);
        return (
          <div key={item.id ?? `${item.label}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 0.35fr) minmax(140px, 1fr) auto', gap: 8, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: theme.text, fontSize: '0.68rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
              {item.description && <div style={{ color: theme.mutedText, fontSize: '0.58rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>}
            </div>
            <div style={{ position: 'relative', height: 22, borderRadius: 5, background: theme.surfaceAlt, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: `${left}%`, width: `${Math.min(width, 100 - left)}%`, minWidth: 8, height: '100%', borderRadius: 5, background: colors.fill }} />
            </div>
            <span style={{ color: colors.text, fontSize: '0.62rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{item.value ?? ''}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ComparisonDiagram({ metrics, series, theme }: { metrics: ComparisonMetric[]; series: ComparisonSeries[]; theme: PaperContentTheme }) {
  const maximums = new Map(metrics.map((metric) => [
    metric.key,
    Math.max(...series.map((entry) => entry.values[metric.key] ?? 0), metric.format === 'percent' ? 1 : 0, 1e-9),
  ]));

  return (
    <div data-testid="structured-comparison" style={{ display: 'grid', gap: 10 }}>
      {series.map((entry, seriesIndex) => {
        const colors = palette(theme, entry.tone ?? (seriesIndex === 0 ? 'neutral' : 'info'));
        return (
          <div key={`${entry.label}-${seriesIndex}`} style={{ border: `1px solid ${colors.border}`, borderRadius: 9, background: colors.background, padding: '9px 10px' }}>
            <div style={{ marginBottom: 8 }}>
              <strong style={{ color: colors.text, fontSize: '0.72rem' }}>{entry.label}</strong>
              {entry.description && <p style={{ color: theme.mutedText, fontSize: '0.6rem', margin: '2px 0 0' }}>{entry.description}</p>}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {metrics.map((metric) => {
                const value = entry.values[metric.key] ?? 0;
                const maximum = maximums.get(metric.key) ?? 1;
                const width = metric.format === 'percent' ? value * 100 : (value / maximum) * 100;
                return (
                  <div key={metric.key} style={{ display: 'grid', gridTemplateColumns: '76px 1fr 58px', gap: 7, alignItems: 'center' }}>
                    <span style={{ color: theme.mutedText, fontSize: '0.58rem', fontWeight: 600 }}>{metric.label}</span>
                    <div style={{ height: 7, borderRadius: 999, background: theme.surfaceAlt, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(0, Math.min(width, 100))}%`, borderRadius: 999, background: colors.fill }} />
                    </div>
                    <span style={{ color: colors.text, fontSize: '0.6rem', fontWeight: 700, textAlign: 'right' }}>{formatMetric(metric, value)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
