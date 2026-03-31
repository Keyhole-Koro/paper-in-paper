import { StoreProvider } from '../store';
import PaperScene from './PaperScene';

export default function PaperApp() {
  return (
    <StoreProvider>
      <PaperScene />
    </StoreProvider>
  );
}
