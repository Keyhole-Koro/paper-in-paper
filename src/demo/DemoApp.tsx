import { PaperCanvas } from '../lib';
import { buildDemoPaperMap } from './demoData';

const demoPaperMap = buildDemoPaperMap();

export default function DemoApp() {
  return (
    <PaperCanvas
      paperMap={demoPaperMap}
      rootCanvasStyle={{
        width: 1440,
        height: 960,
      }}
      layoutOptions={{
        maxOpenChildrenPerParent: 3,
        openMeasureDelayMs: 180,
        gridGapPx: 10,
        gridColumns: {
          narrowColumns: 2,
          mediumColumns: 4,
          wideColumns: 6,
        },
        singleOpen: {
          minRows: 4,
          extraRows: 1,
        },
        descendantPressure: {
          maxDepthBoost: 3,
          maxColBoost: 2,
        },
      }}
    />
  );
}
