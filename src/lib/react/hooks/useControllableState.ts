import { useCallback, useRef, useState } from 'react';

/**
 * controlled / uncontrolled を吸収する薄い adapter。
 * - value が渡されれば controlled（内部 state は使わない）
 * - value が undefined なら uncontrolled（内部 state を使う）
 */
export function useControllableState<T>(
  value: T | undefined,
  onChange: ((v: T) => void) | undefined,
  initialValue: T,
): [T, (v: T) => void] {
  const [internalValue, setInternalValue] = useState<T>(initialValue);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const isControlled = value !== undefined;
  const current = isControlled ? value : internalValue;

  const setValue = useCallback(
    (next: T) => {
      if (!isControlled) setInternalValue(next);
      onChangeRef.current?.(next);
    },
    [isControlled],
  );

  return [current, setValue];
}
