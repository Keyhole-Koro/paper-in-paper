import type { PaperId } from '../../core/types';
import { walkHiddenChain } from '../../core/expansion';
import { applyRules, ruleBreakChainAt } from '../../core/expansionRules';
import { usePaperDispatch, usePaperStoreSelector } from '../context/PaperStoreContext';
import type { PaperTone } from '../internal/paperColors';

interface PaperBreadcrumbsProps {
  nodeId: PaperId;
  parentId: PaperId;
  title: string;
  tone: PaperTone;
}

function shallowEqualBreadcrumbSelection(
  a: {
    breadcrumbs: { id: PaperId; title: string }[];
    expansionMap: unknown;
    paperMap: unknown;
  },
  b: {
    breadcrumbs: { id: PaperId; title: string }[];
    expansionMap: unknown;
    paperMap: unknown;
  },
) {
  if (a.expansionMap !== b.expansionMap || a.paperMap !== b.paperMap) return false;
  if (a.breadcrumbs.length !== b.breadcrumbs.length) return false;
  for (let i = 0; i < a.breadcrumbs.length; i += 1) {
    if (a.breadcrumbs[i].id !== b.breadcrumbs[i].id || a.breadcrumbs[i].title !== b.breadcrumbs[i].title) {
      return false;
    }
  }
  return true;
}

export function PaperBreadcrumbs({ nodeId, parentId, title, tone }: PaperBreadcrumbsProps) {
  const dispatch = usePaperDispatch();
  const { breadcrumbs, expansionMap, paperMap } = usePaperStoreSelector(({ state }) => {
    const parentPaper = state.paperMap.get(parentId);
    if (!parentPaper) {
      return {
        breadcrumbs: [] as { id: PaperId; title: string }[],
        expansionMap: state.expansionMap,
        paperMap: state.paperMap,
      };
    }
    const hiddenIds = walkHiddenChain(parentId, nodeId, state.expansionMap);
    return {
      breadcrumbs: [parentId, ...hiddenIds, nodeId].map((id) => ({
        id,
        title: state.paperMap.get(id)?.title ?? '',
      })),
      expansionMap: state.expansionMap,
      paperMap: state.paperMap,
    };
  }, shallowEqualBreadcrumbSelection);

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
                const next = applyRules(expansionMap, paperMap, crumb.id, ruleBreakChainAt);
                for (const [currentParentId, entry] of expansionMap) {
                  const nextOpenIds = next.get(currentParentId)?.openChildIds ?? [];
                  for (const childId of entry.openChildIds) {
                    if (!nextOpenIds.includes(childId)) {
                      dispatch({ type: 'CLOSE_NODE', parentId: currentParentId, childId });
                    }
                  }
                }
                for (const [nextParentId, entry] of next) {
                  const currentOpenIds = expansionMap.get(nextParentId)?.openChildIds ?? [];
                  for (const childId of entry.openChildIds) {
                    if (!currentOpenIds.includes(childId)) {
                      dispatch({ type: 'OPEN_NODE', parentId: nextParentId, childId });
                    }
                  }
                }
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
