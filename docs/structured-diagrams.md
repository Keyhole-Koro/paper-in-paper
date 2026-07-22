# Structured diagram content

`ContentNode[]` can include four JSON-serializable diagram nodes. They use the
active paper theme and do not add a charting dependency.

## Flow

Use `flow` for a linear pipeline. A step may expose one or more side branches
for errors, fallbacks, or alternate outcomes.

```ts
const content: ContentNode[] = [
  {
    type: 'flow',
    direction: 'horizontal',
    steps: [
      { id: 'cases', title: 'Cases loaded', value: '216' },
      {
        id: 'model',
        title: 'Model completed',
        value: '213',
        tone: 'info',
        branches: [{ label: 'Execution errors', value: '3', tone: 'danger' }],
      },
      {
        id: 'schema',
        title: 'Schema valid',
        value: '207',
        tone: 'warning',
        branches: [{ label: 'Schema invalid', value: '6', tone: 'warning' }],
      },
      { id: 'passed', title: 'Assertions passed', value: '204', tone: 'success' },
    ],
  },
];
```

Set `direction: 'vertical'` for narrow papers.

## Funnel

`total` controls the percentage denominator. When omitted, the first stage is
used as the total.

```ts
{
  type: 'funnel',
  total: 216,
  stages: [
    { label: 'Cases loaded', value: 216 },
    { label: 'Execution completed', value: 213, tone: 'info' },
    { label: 'Schema valid', value: 207, tone: 'warning' },
    { label: 'Passed', value: 204, tone: 'success' },
  ],
}
```

## Timeline

Timeline items accept numeric ranges or date strings. The renderer normalizes
all lanes to the earliest start and latest end.

```ts
{
  type: 'timeline',
  items: [
    {
      id: 'run-a',
      label: 'production',
      description: 'gemini-2.5-pro',
      start: '2026-07-22T02:00:00Z',
      end: '2026-07-22T02:00:51Z',
      value: '51s',
      tone: 'danger',
    },
    {
      id: 'run-b',
      label: 'variant:concise-v3',
      start: '2026-07-22T03:00:00Z',
      end: '2026-07-22T03:00:42Z',
      value: '42s',
      tone: 'success',
    },
  ],
}
```

## Comparison

A comparison node renders multiple metrics for each series. Supported formats
are `number`, `percent`, and `duration-ms`.

```ts
{
  type: 'comparison',
  metrics: [
    { key: 'passRate', label: 'Pass', format: 'percent' },
    { key: 'latency', label: 'Avg run', format: 'duration-ms' },
    { key: 'tokens', label: 'Tokens/case', format: 'number' },
  ],
  series: [
    {
      label: 'production',
      values: { passRate: 0.926, latency: 50120, tokens: 15767 },
    },
    {
      label: 'variant:concise-v3',
      tone: 'success',
      values: { passRate: 0.983, latency: 43840, tokens: 14050 },
    },
  ],
}
```

## Tones

All diagram elements accept one of:

- `neutral`
- `info`
- `success`
- `warning`
- `danger`

Neutral and info tones derive from the current paper theme. Semantic tones use
accessible success, warning, and danger palettes so failure paths remain easy
to scan.
