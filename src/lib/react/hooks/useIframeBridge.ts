import { useCallback, useEffect, useRef } from 'react';
import type { PaperId } from '../../core/types';
import { buildSrcDoc, isPaperContentEvent, type PaperContentEvent } from '../internal/iframeBridge';

interface IframeTheme {
  surface: string;
  surfaceAlt: string;
  surfaceRaised: string;
  text: string;
  mutedText: string;
  divider: string;
  linkBackground: string;
  linkBackgroundHover: string;
  linkBorder: string;
  linkText: string;
}

interface UseIframeBridgeOptions {
  content: string;
  theme: IframeTheme;
  fontSize: number;
  overrideCss?: string;
  openIds?: PaperId[];
  onEvent: (event: PaperContentEvent) => void;
}

export function useIframeBridge({ content, theme, fontSize, overrideCss, openIds, onEvent }: UseIframeBridgeOptions) {
  const srcDoc = buildSrcDoc(content, theme, fontSize, overrideCss);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const openIdsRef = useRef(openIds);
  openIdsRef.current = openIds;

  // iframeがロードされたら現在の openIds を送る
  const sendOpenIds = useCallback((iframe: HTMLIFrameElement) => {
    const ids = openIdsRef.current ?? [];
    iframe.contentWindow?.postMessage({ type: 'setOpenIds', openIds: ids }, '*');
  }, []);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ref callback: iframeがマウント/アンマウントされたとき
  const setIframeRef = useCallback((el: HTMLIFrameElement | null) => {
    (iframeRef as { current: HTMLIFrameElement | null }).current = el;
    if (!el) return;

    function onLoad() {
      sendOpenIds(el!);
    }

    function handleMessage(e: MessageEvent) {
      if (e.source !== el!.contentWindow) return;
      if (!isPaperContentEvent(e.data)) return;
      onEventRef.current(e.data);
    }

    el.addEventListener('load', onLoad);
    window.addEventListener('message', handleMessage);

    // cleanup は返せないのでWeakMapで管理
    (el as any).__cleanup = () => {
      el.removeEventListener('load', onLoad);
      window.removeEventListener('message', handleMessage);
    };
  }, [sendOpenIds]);

  // openIds が変わったら即送信
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    sendOpenIds(iframe);
  }, [openIds, sendOpenIds]);

  // アンマウント時にcleanup
  useEffect(() => {
    return () => {
      const iframe = iframeRef.current;
      if (iframe && (iframe as any).__cleanup) {
        (iframe as any).__cleanup();
      }
    };
  }, []);

  return { iframeRef: setIframeRef, srcDoc };
}
