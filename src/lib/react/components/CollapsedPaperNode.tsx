import type { PaperTone } from '../internal/paperColors';

interface CollapsedPaperNodeProps {
  tone: PaperTone;
}

export function CollapsedPaperNode({ tone }: CollapsedPaperNodeProps) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        border: `1px solid ${tone.border}`,
        borderRadius: 8,
        background: tone.background,
        boxSizing: 'border-box',
      }}
    />
  );
}
