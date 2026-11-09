import { createPortal } from 'react-dom';
import { buildCanvasDebugText, buildFocusedDebugText } from '../internal/canvasDebug';
import { usePaperStoreApi, useStoreValue } from '../store/storeContext';

/** Overlay with the focused paper's layout numbers; only mounted when `debug` is on. */
export function PaperCanvasDebugPanel() {
  const store = usePaperStoreApi();
  const snapshot = useStoreValue((s) => s);
  const text = buildFocusedDebugText(snapshot);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 99999,
        width: 320,
        maxWidth: 'calc(100vw - 32px)',
        background: 'rgba(0,0,0,0.78)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: 1.5,
        border: '1px solid #0f0',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 10px',
          borderBottom: '1px solid rgba(0,255,0,0.25)',
        }}
      >
        <strong style={{ fontSize: 11 }}>debug</strong>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(buildCanvasDebugText(store.getSnapshot()));
          }}
          style={{
            padding: '3px 8px',
            background: 'transparent',
            color: '#0f0',
            fontFamily: 'inherit',
            fontSize: 11,
            border: '1px solid rgba(0,255,0,0.5)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          copy
        </button>
      </div>
      <div style={{ padding: '10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</div>
    </div>,
    document.body,
  );
}
