import { AnimatePresence, motion } from 'framer-motion';
import { memo, useCallback, useMemo, useState } from 'react';
import type { PaperId, PaperMap } from '../../core/types';
import { useStore } from './store';
import ChildCard from './ChildCard';

const lt = { duration: 0.45, ease: [0.4, 0, 0.2, 1] } as const;
const BRANCH_HUES = [210, 155, 35, 280, 10, 180, 320, 60];
const EMPTY_IDS: PaperId[] = [];

// rootId is passed directly to avoid scanning the whole Map on every call
function getBranchHue(paperMap: PaperMap, paperId: PaperId, rootId: PaperId): number | null {
  const root = paperMap.get(rootId);
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

const Breadcrumb = memo(function Breadcrumb({
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
  onSelectContext?: (paperId: PaperId | null) => void;
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
});

const ContextStrip = memo(function ContextStrip({
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
});

interface Props {
  paperId: PaperId;
  parentId: PaperId | null;
  isPrimary: boolean;
  depth: number;
  crumbs: PaperId[];
  hue: number | null;
  selectedContextId: PaperId | null;
  onSelectContext: (paperId: PaperId | null) => void;
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

const PaperNode = memo(function PaperNode({
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
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const paper = state.paperMap.get(paperId)!;
  const expansion = state.expansionMap.get(paperId);
  const openChildIds = expansion?.openChildIds ?? EMPTY_IDS;
  const primaryChildId = expansion?.primaryChildId ?? null;
  const isRoot = parentId === null;

  // Use Set for O(1) lookup instead of O(n) Array.includes
  const openChildIdsSet = useMemo(() => new Set(openChildIds), [openChildIds]);
  const closedChildIds = useMemo(
    () => paper.childIds.filter((id) => !openChildIdsSet.has(id)),
    [paper.childIds, openChildIdsSet],
  );

  // Stable reference for [...crumbs, paperId] — doubles as activePath for context clicks
  const childCrumbs = useMemo(() => [...crumbs, paperId], [crumbs, paperId]);

  const childHue = useCallback((childId: PaperId): number | null => {
    if (isRoot) {
      // paperId IS the rootId here, no need to scan the whole Map
      return getBranchHue(state.paperMap, childId, paperId);
    }
    return hue;
  }, [isRoot, state.paperMap, paperId, hue]);

  // Passthrough-specific values — computed unconditionally to satisfy Rules of Hooks
  const singleChildId = openChildIds.length === 1 ? openChildIds[0] : null;
  const passthroughContextPathIds = useMemo(
    () => singleChildId !== null ? [...childCrumbs, singleChildId] : childCrumbs,
    [childCrumbs, singleChildId],
  );
  const closedSiblings = useMemo(
    () => singleChildId !== null ? paper.childIds.filter((id) => id !== singleChildId) : EMPTY_IDS,
    [paper.childIds, singleChildId],
  );
  const shouldHideDefaultStrip = useMemo(
    () => singleChildId !== null &&
      selectedContextId !== null &&
      selectedContextId !== paperId &&
      isDescendantOf(state.paperMap, selectedContextId, singleChildId),
    [singleChildId, selectedContextId, paperId, state.paperMap],
  );

  const handleHeaderClick = useCallback(() => {
    if (isRoot) return;
    if (isPrimary) {
      dispatch({ type: 'CLOSE', paperId, parentId: parentId! });
      return;
    }
    dispatch({ type: 'SET_PRIMARY', parentId: parentId!, childId: paperId });
  }, [isRoot, isPrimary, dispatch, paperId, parentId]);

  const handleCrumbClick = useCallback((idx: number) => {
    const toClose = idx + 1 < crumbs.length ? crumbs[idx + 1] : paperId;
    const fromParent = crumbs[idx];
    dispatch({ type: 'CLOSE', paperId: toClose, parentId: fromParent });
  }, [crumbs, paperId, dispatch]);

  const handleContextChildClick = useCallback((contextId: PaperId, childId: PaperId) => {
    if (contextId === paperId) {
      dispatch({ type: 'OPEN', parentId: paperId, childId });
      return;
    }

    // childCrumbs = [...crumbs, paperId] == activePath
    const contextIndex = childCrumbs.indexOf(contextId);
    const activeChildId = contextIndex === -1 ? null : childCrumbs[contextIndex + 1] ?? null;

    if (activeChildId === childId) {
      dispatch({ type: 'SET_PRIMARY', parentId: contextId, childId });
      return;
    }

    dispatch({ type: 'OPEN', parentId: contextId, childId });
  }, [paperId, dispatch, childCrumbs]);

  const onContextChildClick = useCallback(
    (childId: PaperId) => handleContextChildClick(paperId, childId),
    [handleContextChildClick, paperId],
  );

  const handleHeaderMouseLeave = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientY >= bounds.bottom - 1) {
      onSelectContext(null);
    }
  }, [onSelectContext]);

  if (openChildIds.length === 1 && singleChildId !== null) {
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
            currentPathIds={passthroughContextPathIds}
            getHue={childHue}
            onChildClick={onContextChildClick}
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
          crumbs={childCrumbs}
          hue={childHue(singleChildId)}
          selectedContextId={selectedContextId}
          onSelectContext={onSelectContext}
        />
      </motion.div>
    );
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
  const contentColor = hue !== null ? `hsl(${hue}, 20%, 32%)` : '#2b2b36';
  const headerBorderColor = hue !== null
    ? `hsl(${hue}, 30%, ${isPrimary ? 82 : 85}%)`
    : 'rgba(0,0,0,0.07)';
  const shouldCollapseContent = openChildIds.length > 0;
  const shouldShowContent = isPrimary && Boolean(paper.content) && (!shouldCollapseContent || isHeaderHovered);

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
        <div
          className="paper-node__header paper-node__header--root"
          onMouseEnter={() => setIsHeaderHovered(true)}
          onMouseLeave={(event) => {
            setIsHeaderHovered(false);
            handleHeaderMouseLeave(event);
          }}
        >
          <div className="paper-node__title" style={{ color: '#e8e8f4' }}>{paper.title}</div>
          {isHeaderHovered && (
            <div className="paper-node__body" style={{ color: 'rgba(255,255,255,0.45)' }}>{paper.description}</div>
          )}
        </div>
      ) : (
        <button
          className={`paper-node__header ${isPrimary ? 'paper-node__header--primary' : 'paper-node__header--secondary'}`}
          style={{ borderBottomColor: headerBorderColor }}
          onClick={handleHeaderClick}
          title={isPrimary ? 'Close' : 'Make primary'}
          onMouseEnter={() => setIsHeaderHovered(true)}
          onMouseLeave={(event) => {
            setIsHeaderHovered(false);
            handleHeaderMouseLeave(event);
          }}
          onFocus={() => setIsHeaderHovered(true)}
          onBlur={() => setIsHeaderHovered(false)}
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
          {isHeaderHovered && <div className="paper-node__body" style={{ color: bodyColor }}>{paper.description}</div>}
        </button>
      )}

      <div className="paper-node__content">
        <AnimatePresence initial={false}>
          {shouldShowContent && (
            <motion.div
              key="content"
              className="paper-node__content-copy"
              style={{ color: contentColor }}
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
            >
              {paper.content}
            </motion.div>
          )}
        </AnimatePresence>
        {selectedContextId === paperId && (
          <ContextStrip
            paperMap={state.paperMap}
            contextId={paperId}
            currentPathIds={childCrumbs}
            getHue={childHue}
            onChildClick={onContextChildClick}
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
                  crumbs={EMPTY_IDS}
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
});

export default PaperNode;
