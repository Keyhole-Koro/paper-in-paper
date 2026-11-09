import { act, cleanup, render, screen } from '@testing-library/react';
import { useCallback } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Paper, PaperViewState } from '../../src/lib/core/types';
import { buildPaperMap } from '../../src/lib/core/tree';
import { PaperCanvas } from '../../src/lib/react/PaperCanvas';
import { useCanvasHandle, useCanvasSelector } from '../../src/lib/react/hooks/useCanvasSelector';
import { useSiblingShare } from '../../src/lib/react/hooks/useSiblingShare';
import { usePaperDispatch, usePaperStoreSelector } from '../../src/lib/react/store/storeContext';
import type { PaperStoreSnapshot } from '../../src/lib/react/store/createPaperStore';
import { expansion } from '../helpers/papers';
import { renderCanvas, stubLayout } from '../helpers/render';

afterEach(cleanup);

function ShareProbe() {
  const { shareOf } = useSiblingShare({ id: 'root' }, { whenFocused: 0.5 });
  return <span data-testid="shares">{['a', 'b', 'c'].map((id) => shareOf({ id }).toFixed(2)).join(',')}</span>;
}

function SelectorProbe() {
  const select = useCallback((snapshot: PaperStoreSnapshot) => snapshot.state.focusedNodeId ?? 'none', []);
  const focused = usePaperStoreSelector(select);
  const dispatch = usePaperDispatch();
  return (
    <button type="button" onClick={() => dispatch({ type: 'OPEN_NODE', parentId: 'root', childId: 'c' })}>
      focused:{focused}
    </button>
  );
}

const papers = (rootContent: Paper['content']) => buildPaperMap([
  { id: 'root', title: 'root', description: '', content: rootContent, parentId: null, childIds: ['a', 'b', 'c'] },
  { id: 'a', title: 'a', description: '', content: <p>a</p>, parentId: 'root', childIds: [] },
  { id: 'b', title: 'b', description: '', content: <p>b</p>, parentId: 'root', childIds: [] },
  { id: 'c', title: 'c', description: '', content: <p>c</p>, parentId: 'root', childIds: [] },
]);

describe('hooks inside paper content', () => {
  it('useSiblingShare and usePaperStoreSelector follow the canvas state', async () => {
    const view = await renderCanvas({
      paperMap: papers(<div><ShareProbe /><SelectorProbe /></div>),
      defaultOpenState: { expansionMap: expansion({ root: ['a', 'b'] }) },
    });
    expect(screen.getByTestId('shares').textContent).toBe('0.50,0.50,0.00');
    await act(async () => view.handle.current!.dispatch({ type: 'FOCUS_NODE', nodeId: 'a' }));
    expect(screen.getByTestId('shares').textContent).toBe('0.50,0.50,0.00');
    act(() => screen.getByRole('button', { name: /focused:a/ }).click());
    expect(screen.getByRole('button', { name: /focused:c/ })).toBeTruthy();
    expect(screen.getByTestId('shares').textContent).toBe('0.25,0.25,0.50');
  });

  it('throw a helpful error outside a canvas', () => {
    expect(() => render(<SelectorProbe />)).toThrow(/inside <PaperCanvas>/);
  });
});

describe('useCanvasSelector', () => {
  function Outside({ show }: { show: boolean }) {
    const { ref, handle } = useCanvasHandle();
    const select = useCallback((state: PaperViewState) => state.expansionMap.get('root')?.openChildIds.join('+') ?? '', []);
    const open = useCanvasSelector(handle, select, 'no canvas');
    return (
      <div>
        <span data-testid="open">{open}</span>
        <button type="button" onClick={() => handle?.dispatch({ type: 'OPEN_NODE', parentId: 'root', childId: 'b' })}>open b</button>
        <div style={{ height: 600 }}>{show && <PaperCanvas ref={ref} paperMap={papers(<p>root</p>)} />}</div>
      </div>
    );
  }

  it('reads the fallback without a canvas and follows the canvas once mounted', async () => {
    stubLayout(() => null);
    const view = render(<Outside show={false} />);
    expect(screen.getByTestId('open').textContent).toBe('no canvas');
    view.rerender(<Outside show />);
    await act(async () => {});
    expect(screen.getByTestId('open').textContent).toBe('');
    act(() => screen.getByRole('button', { name: 'open b' }).click());
    expect(screen.getByTestId('open').textContent).toBe('b');
    view.rerender(<Outside show={false} />);
    await act(async () => {});
    expect(screen.getByTestId('open').textContent).toBe('no canvas');
  });
});
