import { createContext, useContext } from 'react';

// LoadImageUrl turns a content image's data-file-id marker into a displayable
// URL. paper-in-paper stays agnostic about how: the host (e.g. an authenticated
// signed-URL RPC) supplies the implementation. Returning a rejected promise (or
// throwing) leaves the image blank rather than breaking the content.
export type LoadImageUrl = (fileId: string) => Promise<string>;

export const LoadImageUrlContext = createContext<LoadImageUrl | null>(null);

export function useLoadImageUrl(): LoadImageUrl | null {
  return useContext(LoadImageUrlContext);
}
