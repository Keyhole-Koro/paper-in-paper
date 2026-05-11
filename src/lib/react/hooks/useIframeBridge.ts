import { useCallback, useEffect, useMemo, useRef } from 'react';
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
  const srcDoc = useMemo(() => buildSrcDoc(content, theme, fontSize, overrideCss), [
    content,
    fontSize,
    overrideCss,
    theme.surface,
    theme.surfaceAlt,
    theme.surfaceRaised,
    theme.text,
    theme.mutedText,
    theme.divider,
    theme.linkBackground,
    theme.linkBackgroundHover,
    theme.linkBorder,
    theme.linkText,
  ]);
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
  const cleanupRef = useRef<(() => void) | null>(null);

  // ref callback: iframeがマウント/アンマウントされたとき
  const setIframeRef = useCallback((el: HTMLIFrameElement | null) => {
    if (iframeRef.current === el && el !== null) return;
    if (iframeRef.current !== el) {
      cleanupRef.current?.();
      cleanupRef.current = null;
    }
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

    cleanupRef.current = () => {
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
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  return { iframeRef: setIframeRef, srcDoc };
}
