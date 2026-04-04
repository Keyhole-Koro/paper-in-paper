import { createContext, useContext } from 'react';

export const DebugContext = createContext(false);

export function useDebug(): boolean {
  return useContext(DebugContext);
}
