import { memo } from 'react';
import type { Paper, PaperId, PaperMap } from '../../../../core/types';

interface BreadcrumbProps {
  paperMap: PaperMap;
  crumbs: PaperId[];
  paperId: PaperId;
  onCrumbClick?: (idx: number) => void;
  hue: number | null;
  allowCrumbInteractions: boolean;
}

const Breadcrumb = memo(function Breadcrumb({
  paperMap,
  crumbs,
  paperId,
  onCrumbClick,
  hue,
  allowCrumbInteractions,
}: BreadcrumbProps) {
  const ancestorColor = hue !== null ? `hsl(${hue}, 40%, 50%)` : '#9999b8';
  const currentColor = hue !== null ? `hsl(${hue}, 60%, 28%)` : '#111118';

  return (
    <div className="paper-node__breadcrumb">
      {crumbs.map((id, index) => (
        <span
          key={id}
          className="paper-node__breadcrumb-ancestor"
          style={{ color: ancestorColor }}
          onClick={allowCrumbInteractions ? (event) => {
            event.stopPropagation();
            onCrumbClick?.(index);
          } : undefined}
          role={allowCrumbInteractions ? 'button' : undefined}
          tabIndex={allowCrumbInteractions ? 0 : undefined}
          onKeyDown={allowCrumbInteractions ? (event) => event.key === 'Enter' && onCrumbClick?.(index) : undefined}
        >
          {paperMap.get(id)!.title}
          <span className="paper-node__breadcrumb-sep" style={{ color: ancestorColor, opacity: 0.5 }}> / </span>
        </span>
      ))}
      <span
        className="paper-node__breadcrumb-current"
        style={{ color: currentColor }}
      >
        {paperMap.get(paperId)!.title}
      </span>
    </div>
  );
});

interface PaperHeaderProps {
  paper: Paper;
  paperMap: PaperMap;
  paperId: PaperId;
  crumbs: PaperId[];
  hue: number | null;
  isRoot: boolean;
  isPrimary: boolean;
  isHovered: boolean;
  onHeaderClick: () => void;
  onCrumbClick: (idx: number) => void;
  onHoverChange: (hovered: boolean) => void;
  onMouseLeaveDownward: (event: React.MouseEvent<HTMLElement>) => void;
  allowCrumbInteractions?: boolean;
  allowHeaderInteractions?: boolean;
}

export default memo(function PaperHeader({
  paper,
  paperMap,
  paperId,
  crumbs,
  hue,
  isRoot,
  isPrimary,
  isHovered,
  onHeaderClick,
  onCrumbClick,
  onHoverChange,
  onMouseLeaveDownward,
  allowCrumbInteractions = true,
  allowHeaderInteractions = true,
}: PaperHeaderProps) {
  const bodyColor = hue !== null ? `hsl(${hue}, 25%, 42%)` : '#55556a';
  const headerBorderColor = hue !== null
    ? `hsl(${hue}, 30%, ${isPrimary ? 82 : 85}%)`
    : 'rgba(0,0,0,0.07)';

  if (isRoot) {
    return (
      <div
        className="paper-node__header paper-node__header--root"
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={(event) => {
          onHoverChange(false);
          onMouseLeaveDownward(event);
        }}
      >
        <div className="paper-node__title" style={{ color: '#1d1d27' }}>{paper.title}</div>
        {isHovered && (
          <div className="paper-node__body" style={{ color: 'rgba(29,29,39,0.56)' }}>{paper.description}</div>
        )}
      </div>
    );
  }

  if (!allowHeaderInteractions) {
    return (
      <div
        className={`paper-node__header ${isPrimary ? 'paper-node__header--primary' : 'paper-node__header--secondary'}`}
        style={{ borderBottomColor: headerBorderColor }}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={(event) => {
          onHoverChange(false);
          onMouseLeaveDownward(event);
        }}
      >
        <Breadcrumb
          paperMap={paperMap}
          crumbs={crumbs}
          paperId={paperId}
          onCrumbClick={onCrumbClick}
          hue={hue}
          allowCrumbInteractions={allowCrumbInteractions}
        />
        {isHovered && <div className="paper-node__body" style={{ color: bodyColor }}>{paper.description}</div>}
      </div>
    );
  }

  return (
    <button
      className={`paper-node__header ${isPrimary ? 'paper-node__header--primary' : 'paper-node__header--secondary'}`}
      style={{ borderBottomColor: headerBorderColor }}
      onClick={onHeaderClick}
      title={isPrimary ? 'Close' : 'Make primary'}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={(event) => {
        onHoverChange(false);
        onMouseLeaveDownward(event);
      }}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
    >
      <Breadcrumb
        paperMap={paperMap}
        crumbs={crumbs}
        paperId={paperId}
        onCrumbClick={onCrumbClick}
        hue={hue}
        allowCrumbInteractions={allowCrumbInteractions}
      />
      {isHovered && <div className="paper-node__body" style={{ color: bodyColor }}>{paper.description}</div>}
    </button>
  );
});
