import { PaperCanvas } from '../lib';
import { buildDemoPaperMap } from './demoData';

const demoPaperMap = buildDemoPaperMap();

export default function DemoApp() {
  return <PaperCanvas paperMap={demoPaperMap} />;
}
