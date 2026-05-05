import { useMemo } from 'react';
import type { PaperId } from '../../core/types';
import { walkHiddenChain } from '../../core/expansion';
import { applyRules, ruleBreakChainAt } from '../../core/expansionRules';
import { usePaperStore } from '../context/PaperStoreContext';
import { useLayoutContext } from '../context/LayoutContext';
import type { PaperTone } from '../internal/paperColors';

interface PaperBreadcrumbsProps {
  nodeId: PaperId;
  parentId: PaperId;
  title: string;
  tone: PaperTone;
}

export function PaperBreadcrumbs({ nodeId, parentId, title, tone }: PaperBreadcrumbsProps) {
  const { state, dispatch } = usePaperStore();
  const layoutMap = useLayoutContext();

  const breadcrumbs = useMemo(() => {
    const parentPaper = state.paperMap.get(parentId);
    if (!parentPaper) return [];
    const hiddenIds = walkHiddenChain(parentId, nodeId, state.expansionMap);
    return [parentId, ...hiddenIds, nodeId].map(id => ({
      id,
      title: state.paperMap.get(id)?.title ?? '',
    }));
  }, [parentId, nodeId, state.paperMap, state.expansionMap, title, layoutMap]);

  if (breadcrumbs.length === 0) {
    return (
      <span
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: tone.title,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: 'block',
          minWidth: 0,
          flex: 1,
        }}
      >
        {title}
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, overflow: 'hidden' }}>
      {breadcrumbs.map((crumb, i) => {
        const isLast = i === breadcrumbs.length - 1;
        const isClickable = !isLast;
        return (
          <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', flexShrink: isLast ? 1 : 0 }}>
            {i > 0 && (
              <span style={{ margin: '0 3px', color: tone.mutedText, fontSize: 11, flexShrink: 0 }}>/</span>
            )}
            <button
              onPointerDown={e => e.stopPropagation()}
              onPointerUp={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                if (!isClickable) return;
                const next = applyRules(state.expansionMap, state.paperMap, crumb.id, ruleBreakChainAt);
                dispatch({ type: '__SYNC_EXPANSION', expansionMap: next });
                dispatch({ type: 'FOCUS_NODE', nodeId: crumb.id });
              }}
              style={{
                background: 'none',
                border: 'none',
                color: isLast ? tone.title : tone.mutedText,
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: isLast ? 600 : 400,
                padding: '0 2px',
                borderRadius: 3,
                cursor: isClickable ? 'pointer' : 'default',
                whiteSpace: 'nowrap',
                overflow: isLast ? 'hidden' : 'visible',
                textOverflow: isLast ? 'ellipsis' : 'clip',
                textDecoration: 'none',
                transition: 'color 0.15s, text-decoration-color 0.15s',
              }}
              onMouseEnter={e => {
                if (!isClickable) return;
                const el = e.currentTarget;
                el.style.color = tone.title;
                el.style.textDecoration = 'underline';
              }}
              onMouseLeave={e => {
                if (!isClickable) return;
                const el = e.currentTarget;
                el.style.color = tone.mutedText;
                el.style.textDecoration = 'none';
              }}
            >
              {crumb.title}
            </button>
          </span>
        );
      })}
    </div>
  );
}
