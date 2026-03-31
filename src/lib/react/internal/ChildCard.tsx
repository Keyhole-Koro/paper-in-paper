import { motion } from 'framer-motion';
import type { Paper } from '../../core/types';

interface Props {
  paper: Paper;
  hue: number | null;
  onClick: () => void;
}

const lt = { duration: 0.45, ease: [0.4, 0, 0.2, 1] } as const;

export default function ChildCard({ paper, hue, onClick }: Props) {
  const childCount = paper.childIds.length;
  const background = hue !== null ? `hsl(${hue}, 44%, 95%)` : '#f7f7fc';
  const borderColor = hue !== null ? `hsl(${hue}, 34%, 82%)` : '#e4e4ef';
  const titleColor = hue !== null ? `hsl(${hue}, 56%, 24%)` : '#111118';
  const bodyColor = hue !== null ? `hsl(${hue}, 20%, 42%)` : '#7777a0';
  const hintColor = hue !== null ? `hsl(${hue}, 24%, 52%)` : '#aaaacc';
  const shadow = hue !== null ? `0 2px 8px hsla(${hue}, 45%, 42%, 0.08)` : '0 2px 8px rgba(80, 80, 200, 0.08)';
  const previewShadow = hue !== null ? `0 10px 28px hsla(${hue}, 45%, 32%, 0.18)` : '0 10px 28px rgba(0, 0, 0, 0.16)';
  const focusColor = hue !== null ? `hsl(${hue}, 50%, 58%)` : '#8888cc';
  const badgeBackground = hue !== null ? `hsla(${hue}, 48%, 52%, 0.12)` : 'rgba(136, 136, 204, 0.12)';
  const previewBackground = hue !== null ? `hsl(${hue}, 48%, 97%)` : '#fcfcff';

  return (
    <motion.button
      layoutId={paper.id}
      className="child-card child-card--compact"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      onClick={onClick}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ opacity: { duration: 0.2 }, layout: lt, duration: 0.15 }}
      style={{
        borderRadius: 10,
        background,
        borderColor,
        boxShadow: shadow,
        ['--child-card-focus' as string]: focusColor,
        ['--child-card-preview-shadow' as string]: previewShadow,
        ['--child-card-preview-bg' as string]: previewBackground,
      }}
    >
      <motion.div layout="position" className="child-card__row">
        <div className="child-card__title" style={{ color: titleColor }}>{paper.title}</div>
        {childCount > 0 && (
          <div className="child-card__count" style={{ color: hintColor, background: badgeBackground }}>
            {childCount}
          </div>
        )}
      </motion.div>
      <div className="child-card__preview">
        <div className="child-card__preview-title" style={{ color: titleColor }}>{paper.title}</div>
        {paper.body && <div className="child-card__body" style={{ color: bodyColor }}>{paper.body}</div>}
        <div className="child-card__hint" style={{ color: hintColor }}>
          {childCount > 0 ? `${childCount} inside →` : 'Open paper →'}
        </div>
      </div>
    </motion.button>
  );
}
