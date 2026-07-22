import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PaperContentTheme } from './PaperContentFrame';
import {
  ComparisonDiagram,
  FlowDiagram,
  FunnelDiagram,
  TimelineDiagram,
} from './StructuredDiagrams';

const theme: PaperContentTheme = {
  surface: '#ffffff',
  surfaceAlt: '#f5f5f4',
  surfaceRaised: '#fafaf9',
  text: '#292524',
  mutedText: '#78716c',
  divider: '#d6d3d1',
  linkBackground: '#eff6ff',
  linkBackgroundHover: '#dbeafe',
  linkBorder: '#93c5fd',
  linkText: '#1d4ed8',
};

describe('structured diagrams', () => {
  it('renders a flow with branch outcomes', () => {
    render(
      <FlowDiagram
        theme={theme}
        steps={[
          { id: 'input', title: 'Cases', value: '24' },
          { id: 'model', title: 'Model', value: '22', tone: 'info', branches: [{ label: 'Errors', value: '2', tone: 'danger' }] },
          { id: 'pass', title: 'Passed', value: '20', tone: 'success' },
        ]}
      />,
    );

    expect(screen.getByTestId('structured-flow').textContent).toContain('Cases');
    expect(screen.getByTestId('structured-flow').textContent).toContain('Errors');
  });

  it('renders funnel stages relative to a total', () => {
    render(
      <FunnelDiagram
        theme={theme}
        total={100}
        stages={[
          { label: 'Loaded', value: 100 },
          { label: 'Valid', value: 92, tone: 'warning' },
          { label: 'Passed', value: 88, tone: 'success' },
        ]}
      />,
    );

    expect(screen.getByTestId('structured-funnel').textContent).toContain('88.0%');
  });

  it('renders timeline lanes from numeric or date ranges', () => {
    render(
      <TimelineDiagram
        theme={theme}
        items={[
          { id: 'a', label: 'Run A', start: 0, end: 40, value: '40s', tone: 'success' },
          { id: 'b', label: 'Run B', start: '2026-07-22T00:00:00Z', end: '2026-07-22T00:01:00Z', value: '60s' },
        ]}
      />,
    );

    expect(screen.getByTestId('structured-timeline').textContent).toContain('Run B');
  });

  it('renders multi-metric comparisons', () => {
    render(
      <ComparisonDiagram
        theme={theme}
        metrics={[
          { key: 'passRate', label: 'Pass', format: 'percent' },
          { key: 'latency', label: 'Latency', format: 'duration-ms' },
        ]}
        series={[
          { label: 'production', values: { passRate: 0.9, latency: 4200 } },
          { label: 'variant:a', values: { passRate: 0.97, latency: 3800 }, tone: 'success' },
        ]}
      />,
    );

    expect(screen.getByTestId('structured-comparison').textContent).toContain('97.0%');
    expect(screen.getByTestId('structured-comparison').textContent).toContain('3.8s');
  });
});
