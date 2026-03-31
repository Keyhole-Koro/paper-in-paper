import { AnimatePresence, motion } from 'framer-motion';
import type { PaperId, PaperMap } from '../types';
import { useStore } from '../store';
import ChildCard from './ChildCard';

const lt = { duration: 0.45, ease: [0.4, 0, 0.2, 1] } as const;

// Hues assigned to each direct child of root, cycling if there are more than the list.
const BRANCH_HUES = [210, 155, 35, 280, 10, 180, 320, 60];

function getBranchHue(paperMap: PaperMap, paperId: PaperId): number | null {
  const root = [...paperMap.values()].find(p => p.parentId === null);
  if (!root) return null;
  const idx = root.childIds.indexOf(paperId);
  if (idx !== -1) return BRANCH_HUES[idx % BRANCH_HUES.length];
  // Walk up to find the root-child ancestor
  let cur = paperMap.get(paperId)?.parentId ?? null;
  while (cur !== null) {
    const i = root.childIds.indexOf(cur);
    if (i !== -1) return BRANCH_HUES[i % BRANCH_HUES.length];
    cur = paperMap.get(cur)?.parentId ?? null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Breadcrumb
// ─────────────────────────────────────────────────────────────

function Breadcrumb({
  paperMap,
  crumbs,
  paperId,
  onCrumbClick,
  hue,
}: {
  paperMap: PaperMap;
  crumbs: PaperId[];
  paperId: PaperId;
  onCrumbClick?: (idx: number) => void;
  hue: number | null;
}) {
  const ancestorColor = hue !== null ? `hsl(${hue}, 40%, 50%)` : '#9999b8';
  const currentColor  = hue !== null ? `hsl(${hue}, 60%, 28%)` : '#111118';

  return (
    <div className="paper-node__breadcrumb">
      {crumbs.map((id, i) => (
        <span
          key={id}
          className="paper-node__breadcrumb-ancestor"
          style={{ color: ancestorColor }}
          onClick={e => { e.stopPropagation(); onCrumbClick?.(i); }}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && onCrumbClick?.(i)}
        >
          {paperMap.get(id)!.title}
          <span className="paper-node__breadcrumb-sep" style={{ color: ancestorColor, opacity: 0.5 }}> / </span>
        </span>
      ))}
      <span className="paper-node__breadcrumb-current" style={{ color: currentColor }}>
        {paperMap.get(paperId)!.title}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PaperNode
// ─────────────────────────────────────────────────────────────

interface Props {
  paperId: PaperId;
  parentId: PaperId | null;
  isPrimary: boolean;
  depth: number;
  crumbs: PaperId[];
  hue: number | null; // null = root (no branch color)
}

export default function PaperNode({ paperId, parentId, isPrimary, depth, crumbs, hue }: Props) {
  const { state, dispatch } = useStore();
  const paper = state.paperMap.get(paperId)!;
  const expansion = state.expansionMap.get(paperId);
  const openChildIds = expansion?.openChildIds ?? [];
  const primaryChildId = expansion?.primaryChildId ?? null;
  const closedChildIds = paper.childIds.filter(id => !openChildIds.includes(id));
  const isRoot = parentId === null;

  // Each child gets its own hue when opened (resolved from the paperMap).
  function childHue(childId: PaperId): number | null {
    if (isRoot) return getBranchHue(state.paperMap, childId);
    return hue;
  }

  // ── Pass-through mode ──────────────────────────────────────
  if (openChildIds.length === 1) {
    const [singleChildId] = openChildIds;
    const closedSiblings = paper.childIds.filter(id => id !== singleChildId);

    return (
      <motion.div
        layoutId={isRoot ? undefined : paperId}
        layout
        initial={isRoot ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={isRoot ? undefined : { opacity: 0 }}
        transition={{ opacity: { duration: 0.22 }, layout: lt }}
        className="paper-node paper-node--passthrough"
        style={{ flex: isRoot ? 1 : isPrimary ? 2 : 1 }}
      >
        {closedSiblings.length > 0 && (
          <div className="paper-node__sibling-strip">
            <AnimatePresence mode="popLayout" initial={false}>
              {closedSiblings.map(childId => (
                <ChildCard
                  key={childId}
                  paper={state.paperMap.get(childId)!}
                  hue={childHue(childId)}
                  onClick={() => dispatch({ type: 'OPEN', parentId: paperId, childId })}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
        <PaperNode
          paperId={singleChildId}
          parentId={paperId}
          isPrimary={true}
          depth={depth + 1}
          crumbs={[...crumbs, paperId]}
          hue={childHue(singleChildId)}
        />
      </motion.div>
    );
  }

  // ── Normal (box) mode ──────────────────────────────────────

  function handleHeaderClick() {
    if (isRoot) return;
    if (isPrimary) {
      dispatch({ type: 'CLOSE', paperId, parentId: parentId! });
    } else {
      dispatch({ type: 'SET_PRIMARY', parentId: parentId!, childId: paperId });
    }
  }

  function handleCrumbClick(idx: number) {
    const toClose = idx + 1 < crumbs.length ? crumbs[idx + 1] : paperId;
    const fromParent = crumbs[idx];
    dispatch({ type: 'CLOSE', paperId: toClose, parentId: fromParent });
  }

  // Colors derived from hue
  const bg = isRoot
    ? 'transparent'
    : hue !== null
      ? isPrimary
        ? `hsl(${hue}, 55%, ${Math.max(93, 98 - depth * 1.5)}%)`
        : `hsl(${hue}, 35%, ${Math.max(87, 93 - depth * 1.5)}%)`
      : isPrimary
        ? `rgba(255,255,255,${Math.max(0.94, 1 - depth * 0.02)})`
        : `rgba(255,255,255,${Math.max(0.72, 0.82 - depth * 0.04)})`;

  const borderColor = isRoot
    ? 'transparent'
    : hue !== null
      ? `hsl(${hue}, 40%, ${isPrimary ? 78 : 82}%)`
      : isPrimary ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.06)';

  const shadow = isRoot
    ? 'none'
    : isPrimary && hue !== null
      ? `0 4px 24px hsla(${hue}, 50%, 40%, ${Math.min(0.3, 0.1 + depth * 0.06)})`
      : isPrimary
        ? `0 4px 24px rgba(0,0,0,${Math.min(0.25, 0.1 + depth * 0.05)})`
        : 'none';

  const bodyColor  = hue !== null ? `hsl(${hue}, 25%, 42%)` : '#55556a';
  const headerBorderColor = hue !== null
    ? `hsl(${hue}, 30%, ${isPrimary ? 82 : 85}%)`
    : 'rgba(0,0,0,0.07)';

  return (
    <motion.div
      layoutId={isRoot ? undefined : paperId}
      layout
      className={[
        'paper-node',
        isRoot ? 'paper-node--root' : '',
        isPrimary ? 'paper-node--primary' : 'paper-node--secondary',
      ].join(' ')}
      initial={isRoot ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ opacity: { duration: 0.22 }, layout: lt }}
      style={{
        flex: isRoot ? 1 : isPrimary ? 2 : 1,
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: isRoot ? 16 : 14,
        boxShadow: shadow,
      }}
    >
      {/* Header */}
      {isRoot ? (
        <div className="paper-node__header paper-node__header--root">
          <div className="paper-node__title" style={{ color: '#e8e8f4' }}>{paper.title}</div>
          <div className="paper-node__body" style={{ color: 'rgba(255,255,255,0.45)' }}>{paper.body}</div>
        </div>
      ) : (
        <button
          className={`paper-node__header ${isPrimary ? 'paper-node__header--primary' : 'paper-node__header--secondary'}`}
          style={{ borderBottomColor: headerBorderColor }}
          onClick={handleHeaderClick}
          title={isPrimary ? 'Close' : 'Make primary'}
        >
          <Breadcrumb
            paperMap={state.paperMap}
            crumbs={crumbs}
            paperId={paperId}
            onCrumbClick={handleCrumbClick}
            hue={hue}
          />
          {isPrimary && <div className="paper-node__body" style={{ color: bodyColor }}>{paper.body}</div>}
        </button>
      )}

      {/* Content */}
      <div className="paper-node__content">
        {openChildIds.length > 0 && (
          <div className="paper-node__open-children">
            <AnimatePresence mode="popLayout" initial={false}>
              {openChildIds.map(childId => (
                <PaperNode
                  key={childId}
                  paperId={childId}
                  parentId={paperId}
                  isPrimary={childId === primaryChildId}
                  depth={depth + 1}
                  crumbs={[]}
                  hue={childHue(childId)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {closedChildIds.length > 0 && (
          <div className={`paper-node__closed-children ${openChildIds.length > 0 ? 'paper-node__closed-children--strip' : ''}`}>
            <AnimatePresence mode="popLayout" initial={false}>
              {closedChildIds.map(childId => (
                <ChildCard
                  key={childId}
                  paper={state.paperMap.get(childId)!}
                  hue={childHue(childId)}
                  onClick={() => dispatch({ type: 'OPEN', parentId: paperId, childId })}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {paper.childIds.length === 0 && (
          <div className="paper-node__leaf" style={hue !== null ? { color: `hsl(${hue}, 30%, 60%)` } : {}}>— leaf —</div>
        )}
      </div>
    </motion.div>
  );
}
