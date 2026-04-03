import { useEffect, useRef } from 'react';
import { buildSrcDoc, isPaperContentEvent, type PaperContentEvent } from '../internal/iframeBridge';

interface IframeTheme {
  linkBackground: string;
  linkBackgroundHover: string;
  linkBorder: string;
  linkText: string;
}

interface UseIframeBridgeOptions {
  content: string;
  theme: IframeTheme;
  onEvent: (event: PaperContentEvent) => void;
}

export function useIframeBridge({ content, theme, onEvent }: UseIframeBridgeOptions) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const srcDoc = buildSrcDoc(content, theme);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    function handleMessage(e: MessageEvent) {
      if (e.source !== iframe!.contentWindow) return;
      if (!isPaperContentEvent(e.data)) return;
      onEventRef.current(e.data);
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return { iframeRef, srcDoc };
}
