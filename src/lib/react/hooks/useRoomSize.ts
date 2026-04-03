import { useLayoutEffect, useRef, useState } from 'react';

export interface RoomSize {
  width: number;
  height: number;
}

/**
 * ResizeObserver + useLayoutEffect でコンテナのサイズを追跡する。
 */
export function useRoomSize(): [React.RefObject<HTMLDivElement | null>, RoomSize] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<RoomSize>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        Math.abs(prev.width - width) > 1 || Math.abs(prev.height - height) > 1
          ? { width, height }
          : prev,
      );
    });

    observer.observe(el);
    const rect = el.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });

    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
