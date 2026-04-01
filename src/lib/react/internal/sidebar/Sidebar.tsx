import { AnimatePresence, motion } from 'framer-motion';
import type { PaperId, PaperMap } from '../../../core/types';
import type { SidebarMap, SidebarPlacement } from '../types';

interface SidebarCardProps {
  paperId: PaperId;
  placement: SidebarPlacement;
  paperMap: PaperMap;
  onReturn: (paperId: PaperId) => void;
}

function SidebarCard({ paperId, placement, paperMap, onReturn }: SidebarCardProps) {
  const paper = paperMap.get(paperId);
  if (!paper) return null;

  const { hue } = placement;
  const background = hue !== null ? `hsl(${hue}, 50%, 96%)` : '#f5f5fb';
  const accentColor = hue !== null ? `hsl(${hue}, 55%, 55%)` : '#8888cc';
  const titleColor = hue !== null ? `hsl(${hue}, 40%, 22%)` : '#111118';

  const crumbText = placement.crumbs
    .map((id) => paperMap.get(id)?.title)
    .filter(Boolean)
    .join(' / ');

  return (
    <motion.button
      className="sidebar-card"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      style={{ background, borderLeftColor: accentColor }}
      onClick={() => onReturn(paperId)}
      title={`Return "${paper.title}" to canvas`}
    >
      <div className="sidebar-card__title" style={{ color: titleColor }}>
        {paper.title}
      </div>
      {crumbText && (
        <div className="sidebar-card__crumb">{crumbText}</div>
      )}
    </motion.button>
  );
}

interface SidebarProps {
  sidebarMap: SidebarMap;
  paperMap: PaperMap;
  onReturn: (paperId: PaperId) => void;
}

export default function Sidebar({ sidebarMap, paperMap, onReturn }: SidebarProps) {
  if (sidebarMap.size === 0) return null;

  return (
    <div className="paper-sidebar">
      <div className="paper-sidebar__header">Stashed</div>
      <AnimatePresence initial={false}>
        {[...sidebarMap.entries()].map(([paperId, placement]) => (
          <SidebarCard
            key={paperId}
            paperId={paperId}
            placement={placement}
            paperMap={paperMap}
            onReturn={onReturn}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
