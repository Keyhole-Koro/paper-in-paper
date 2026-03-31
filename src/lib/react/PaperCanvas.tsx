import { LayoutGroup } from 'framer-motion';
import { useState } from 'react';
import type { PaperId, PaperMap } from '../core/types';
import { findRootId } from '../core/tree';
import PaperNode from './internal/PaperNode';
import { StoreProvider } from './internal/store';

interface Props {
  paperMap: PaperMap;
  rootId?: PaperId;
}

export default function PaperCanvas({ paperMap, rootId }: Props) {
  const resolvedRootId = rootId ?? findRootId(paperMap);
  const [selectedContextId, setSelectedContextId] = useState<PaperId | null>(null);

  if (!resolvedRootId) {
    throw new Error('PaperCanvas requires a root node.');
  }

  return (
    <StoreProvider paperMap={paperMap}>
      <LayoutGroup>
        <div className="paper-universe">
          <PaperNode
            paperId={resolvedRootId}
            parentId={null}
            isPrimary={true}
            depth={0}
            crumbs={[]}
            hue={null}
            selectedContextId={selectedContextId}
            onSelectContext={setSelectedContextId}
          />
        </div>
      </LayoutGroup>
    </StoreProvider>
  );
}
