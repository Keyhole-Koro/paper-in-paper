import { AnimatePresence, motion } from 'framer-motion';
import type { PaperId, PaperMap } from '../../core/types';
import { useStore } from './store';
import ChildCard from './ChildCard';

const lt = { duration: 0.45, ease: [0.4, 0, 0.2, 1] } as const;
const BRANCH_HUES = [210, 155, 35, 280, 10, 180, 320, 60];

function getBranchHue(paperMap: PaperMap, paperId: PaperId): number | null {
  const root = [...paperMap.values()].find((paper) => paper.parentId === null);
  if (!root) return null;

  const directChildIndex = root.childIds.indexOf(paperId);
  if (directChildIndex !== -1) {
    return BRANCH_HUES[directChildIndex % BRANCH_HUES.length];
  }

  let current = paperMap.get(paperId)?.parentId ?? null;
  while (current !== null) {
    const branchIndex = root.childIds.indexOf(current);
    if (branchIndex !== -1) {
      return BRANCH_HUES[branchIndex % BRANCH_HUES.length];
    }
    current = paperMap.get(current)?.parentId ?? null;
  }

  return null;
}

function Breadcrumb({
  paperMap,
  crumbs,
  paperId,
  onCrumbClick,
  selectedContextId,
  onSelectContext,
  hue,
}: {
  paperMap: PaperMap;
  crumbs: PaperId[];
  paperId: PaperId;
  onCrumbClick?: (idx: number) => void;
  selectedContextId: PaperId | null;
  onSelectContext?: (paperId: PaperId) => void;
  hue: number | null;
}) {
  const ancestorColor = hue !== null ? `hsl(${hue}, 40%, 50%)` : '#9999b8';
  const currentColor = hue !== null ? `hsl(${hue}, 60%, 28%)` : '#111118';

  return (
    <div className="paper-node__breadcrumb">
      {crumbs.map((id, index) => (
        <span
          key={id}
          className={`paper-node__breadcrumb-ancestor ${selectedContextId === id ? 'paper-node__breadcrumb-ancestor--selected' : ''}`}
          style={{ color: ancestorColor }}
          onClick={(event) => {
            event.stopPropagation();
            onCrumbClick?.(index);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => event.key === 'Enter' && onCrumbClick?.(index)}
          onMouseEnter={() => onSelectContext?.(id)}
          onFocus={() => onSelectContext?.(id)}
        >
          {paperMap.get(id)!.title}
          <span className="paper-node__breadcrumb-sep" style={{ color: ancestorColor, opacity: 0.5 }}> / </span>
        </span>
      ))}
      <span
        className={`paper-node__breadcrumb-current ${selectedContextId === paperId ? 'paper-node__breadcrumb-current--selected' : ''}`}
        style={{ color: currentColor }}
        onMouseEnter={() => onSelectContext?.(paperId)}
        onFocus={() => onSelectContext?.(paperId)}
      >
        {paperMap.get(paperId)!.title}
      </span>
    </div>
  );
}

function ContextStrip({
  paperMap,
  contextId,
  currentPathIds,
  getHue,
  onChildClick,
}: {
  paperMap: PaperMap;
  contextId: PaperId;
  currentPathIds: PaperId[];
  getHue: (paperId: PaperId) => number | null;
  onChildClick: (childId: PaperId) => void;
}) {
  const context = paperMap.get(contextId);
  if (!context || context.childIds.length === 0) {
    return null;
  }

  return (
    <div className="paper-node__context-strip">
      {context.childIds.map((childId) => {
        const child = paperMap.get(childId)!;
        const hue = getHue(childId);
        const isActive = currentPathIds.includes(childId);
        const color = hue !== null ? `hsl(${hue}, 56%, ${isActive ? 26 : 34}%)` : isActive ? '#111118' : '#44445d';
        const background = hue !== null
          ? `hsla(${hue}, 56%, ${isActive ? 56 : 52}%, ${isActive ? 0.18 : 0.1})`
          : isActive
            ? 'rgba(17,17,24,0.08)'
            : 'rgba(17,17,24,0.05)';
        const borderColor = hue !== null
          ? `hsla(${hue}, 50%, 42%, ${isActive ? 0.36 : 0.22})`
          : isActive
            ? 'rgba(17,17,24,0.2)'
            : 'rgba(17,17,24,0.1)';

        return (
          <button
            key={childId}
            type="button"
            className="paper-node__context-chip"
            style={{ color, background, borderColor }}
            onClick={(event) => {
              event.stopPropagation();
              onChildClick(childId);
            }}
            title={child.title}
          >
            <span className="paper-node__context-chip-title">{child.title}</span>
            {child.childIds.length > 0 && (
              <span className="paper-node__context-chip-count">{child.childIds.length}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  paperId: PaperId;
  parentId: PaperId | null;
  isPrimary: boolean;
  depth: number;
  crumbs: PaperId[];
  hue: number | null;
  selectedContextId: PaperId | null;
  onSelectContext: (paperId: PaperId) => void;
}

function isDescendantOf(paperMap: PaperMap, paperId: PaperId, ancestorId: PaperId): boolean {
  let current = paperMap.get(paperId)?.parentId ?? null;
  while (current !== null) {
    if (current === ancestorId) {
      return true;
    }
    current = paperMap.get(current)?.parentId ?? null;
  }
  return false;
}

export default function PaperNode({
  paperId,
  parentId,
  isPrimary,
  depth,
  crumbs,
  hue,
  selectedContextId,
  onSelectContext,
}: Props) {
  const { state, dispatch } = useStore();
  const paper = state.paperMap.get(paperId)!;
  const expansion = state.expansionMap.get(paperId);
  const openChildIds = expansion?.openChildIds ?? [];
  const primaryChildId = expansion?.primaryChildId ?? null;
  const closedChildIds = paper.childIds.filter((id) => !openChildIds.includes(id));
  const isRoot = parentId === null;

  function childHue(childId: PaperId): number | null {
    if (isRoot) {
      return getBranchHue(state.paperMap, childId);
    }
    return hue;
  }

  if (openChildIds.length === 1) {
    const [singleChildId] = openChildIds;
    const closedSiblings = paper.childIds.filter((id) => id !== singleChildId);
    const shouldHideDefaultStrip =
      selectedContextId !== null &&
      selectedContextId !== paperId &&
      isDescendantOf(state.paperMap, selectedContextId, singleChildId);

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
        {selectedContextId === paperId ? (
          <ContextStrip
            paperMap={state.paperMap}
            contextId={paperId}
            currentPathIds={[...crumbs, paperId, singleChildId]}
            getHue={childHue}
            onChildClick={(childId) => handleContextChildClick(paperId, childId)}
          />
        ) : !shouldHideDefaultStrip && closedSiblings.length > 0 && (
          <div className="paper-node__sibling-strip">
            <AnimatePresence mode="popLayout" initial={false}>
              {closedSiblings.map((childId) => (
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
          selectedContextId={selectedContextId}
          onSelectContext={onSelectContext}
        />
      </motion.div>
    );
  }

  function handleHeaderClick() {
    if (isRoot) {
      return;
    }

    if (isPrimary) {
      dispatch({ type: 'CLOSE', paperId, parentId: parentId! });
      return;
    }

    dispatch({ type: 'SET_PRIMARY', parentId: parentId!, childId: paperId });
  }

  function handleCrumbClick(idx: number) {
    const toClose = idx + 1 < crumbs.length ? crumbs[idx + 1] : paperId;
    const fromParent = crumbs[idx];
    dispatch({ type: 'CLOSE', paperId: toClose, parentId: fromParent });
  }

  function handleContextChildClick(contextId: PaperId, childId: PaperId) {
    if (contextId === paperId) {
      dispatch({ type: 'OPEN', parentId: paperId, childId });
      return;
    }

    const activePath = [...crumbs, paperId];
    const contextIndex = activePath.indexOf(contextId);
    const activeChildId = contextIndex === -1 ? null : activePath[contextIndex + 1] ?? null;

    if (activeChildId === childId) {
      dispatch({ type: 'SET_PRIMARY', parentId: contextId, childId });
      return;
    }

    dispatch({ type: 'OPEN', parentId: contextId, childId });
  }

  const background = isRoot
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
      : isPrimary
        ? 'rgba(0,0,0,0.08)'
        : 'rgba(0,0,0,0.06)';

  const shadow = isRoot
    ? 'none'
    : isPrimary && hue !== null
      ? `0 4px 24px hsla(${hue}, 50%, 40%, ${Math.min(0.3, 0.1 + depth * 0.06)})`
      : isPrimary
        ? `0 4px 24px rgba(0,0,0,${Math.min(0.25, 0.1 + depth * 0.05)})`
        : 'none';

  const bodyColor = hue !== null ? `hsl(${hue}, 25%, 42%)` : '#55556a';
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
        background,
        border: `1px solid ${borderColor}`,
        borderRadius: isRoot ? 16 : 14,
        boxShadow: shadow,
      }}
    >
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
            selectedContextId={selectedContextId}
            onSelectContext={onSelectContext}
            hue={hue}
          />
          {isPrimary && <div className="paper-node__body" style={{ color: bodyColor }}>{paper.body}</div>}
        </button>
      )}

      <div className="paper-node__content">
        {selectedContextId === paperId && (
          <ContextStrip
            paperMap={state.paperMap}
            contextId={paperId}
            currentPathIds={[...crumbs, paperId]}
            getHue={childHue}
            onChildClick={(childId) => handleContextChildClick(paperId, childId)}
          />
        )}
        {openChildIds.length > 0 && (
          <div className="paper-node__open-children">
            <AnimatePresence mode="popLayout" initial={false}>
              {openChildIds.map((childId) => (
                <PaperNode
                  key={childId}
                  paperId={childId}
                  parentId={paperId}
                  isPrimary={childId === primaryChildId}
                  depth={depth + 1}
                  crumbs={[]}
                  hue={childHue(childId)}
                  selectedContextId={selectedContextId}
                  onSelectContext={onSelectContext}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {closedChildIds.length > 0 && (
          <div className={`paper-node__closed-children ${openChildIds.length > 0 ? 'paper-node__closed-children--strip' : ''}`}>
            <AnimatePresence mode="popLayout" initial={false}>
              {closedChildIds.map((childId) => (
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
