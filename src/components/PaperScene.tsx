import { LayoutGroup } from 'framer-motion';
import PaperNode from './PaperNode';

export default function PaperScene() {
  return (
    <LayoutGroup>
      <div className="paper-universe">
        <PaperNode paperId="root" parentId={null} isPrimary={true} depth={0} crumbs={[]} hue={null} />
      </div>
    </LayoutGroup>
  );
}
