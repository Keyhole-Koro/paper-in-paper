# Paper in Paper React Architecture

How the React layer implements the [Behavior Specification](./behavior-spec.md) and the
[Layout Specification](./layout-spec.md), and the rules that keep it fast and correct.

## Principles

- `core/` is pure TypeScript with no React: the reducer, tree and open-state operations, the
  attention model, layout and space management. Everything there is unit-testable.
- The tree, open state and focus are authoritative state; sizes, layout and index labels are
  derived from it.
- Transient interaction state (drag session, pointer position) never enters the reducer.
- Commands express intent (`OPEN_NODE`, `MOVE_NODE`, ...), not UI events.
- Invalid input degrades to "nothing happens": no command can break the tree, and layout only
  follows open-state entries that match the tree.

## Store

`createPaperStore` is an external store, not React state:

- `dispatch(command)` runs the reducer, then settles space management (see the layout spec)
  and recomputes the layout, then notifies subscribers synchronously, once.
- The snapshot (`{ state, config, rootId, layout, indexLabels }`) is replaced on every change
  and is stable otherwise.
- Layout entries are kept by identity when their values do not change, so per-paper
  subscriptions stay quiet.
- The canvas size and the root are inputs of the store (`setCanvasSize`, `setRootId`); the
  canvas measures itself with a ResizeObserver in a layout effect.

Components read the store with `useSyncExternalStore`:

- `useStoreValue(selector)` for internal use: selectors return primitives or objects taken
  from the snapshot, so `Object.is` is enough.
- `usePaperStoreSelector(selector, isEqual)` for content and hosts: memoizes by snapshot and
  by `isEqual`, so selectors may build objects.

`PaperNode` (memoized) subscribes to exactly three things: its layout entry, its `Paper`, and
whether it is focused. A change elsewhere does not render it.

### Props

`PaperCanvas` creates the store once and syncs props in layout effects (so a change is
rendered before paint, without a stale frame):

- `paperMap` → `SET_PAPER_MAP` when its identity changes. Same papers in a new `Map` is a no-op.
- `expansionMap` / `focusedNodeId` (controlled, optional) → `SET_OPEN_STATE`.
- `config` is resolved by value, so an inline object does not re-lay out.
- `rootId` → `setRootId`.

Callbacks are stored in a ref and read when called. `onPaperMapChange`,
`onExpansionMapChange` and `onFocusedNodeIdChange` fire after a change made inside the canvas
(including space management), not on mount, and never echo a value that came in through a
prop.

## Drag and drop

A separate drag store holds the session, the insert target and the pointer:

- Pointer moves are throttled to animation frames. Only the floating ghost subscribes to the
  pointer; frames subscribe to "am I the target", so a drag re-renders almost nothing.
- Room rects are measured once per drag (and after scroll/resize), excluding the dragged
  paper's subtree.
- The innermost room under the pointer is the target; over a child card, the leading half
  inserts before it and the trailing half after it.
- Window listeners: `pointermove`, `pointerup` (drop), `pointercancel`, `blur`, Escape
  (cancel), and `pointerdown` (a press while dragging means the release was lost: cancel).
  They are removed when the drag ends or the canvas unmounts.
- A drag that starts on a link inside a content frame stays in that frame (the browser routes
  the gesture there), so the frame forwards it: `moveTo` / `release` / `cancel` with the
  frame as the drag's origin, so no other frame can end it. Unmounting the frame cancels it.
- Drop: another parent → `MOVE_NODE`; same parent → `REORDER_WITHIN_PARENT` (view state).

## Content frames

`PaperHtmlContent` renders HTML in an iframe with `sandbox="allow-scripts"` and a meta CSP
whose `script-src` is a nonce made for that document. The bootstrap script runs in `<head>`
and takes the DOM functions it needs from the prototypes before any content exists.

The bootstrap is plain JavaScript in `internal/frame/bootstrap.js`, shipped as text exactly as
written (a `?raw` import) and type-checked through JSDoc against the same message types the
canvas uses (`frame/protocol.ts`).

A single window `message` listener (`frame/registry.ts`) handles only the `pip:hello`
handshake: it compares `event.source` with each registered frame's *current* `contentWindow`
(a frame gets a new window whenever it reloads) and hands the port to that frame's connection
(`frame/connection.ts`), which checks the secret. Everything else travels over the port, so
the connection never has to trust a window message. After each hello, each `load` and each
`leaving` (the bootstrap's `pagehide`), the connection pings the port; no answer in time means
the frame shows a document that is not ours, and the content is replaced. The connection is a
plain object; `useIframeBridge` only ties it to the iframe element.

The frame reports its content height; the canvas sets the iframe height so the paper's
content box scrolls, not the frame. Children render in the paper's `childIds` order and are
positioned by their rects, so a reorder never moves an iframe in the DOM (which would reload
it); hit testing sorts cards by `data-child-index`.

## Performance rules

- Never select something that changes on every state change (e.g. values computed from the
  current time) in a per-paper subscription.
- Context values must be stable: options are memoized, callbacks are read through a getter.
- Anything per-frame (pointer position) lives in its own store slice.
- Derived data that many components need (layout, index labels) is computed once per change
  in the store, not in components.

`test/react/renderCount.test.tsx` pins these down: updating one paper from the host renders
that paper only, no-op commands render nothing, and pointer moves during a drag render no
paper.

## Testing policy

- `core`: unit tests per command and helper, property tests for the layout, and randomized
  command sequences checked against the invariants.
- `react`: integration tests through `PaperCanvas` with a layout stub for jsdom (the canvas
  reports each paper's rect from its own layout, so hit testing works).
- `e2e`: Playwright against the demo and a bare harness page (`harness.html`, papers set
  per test, optionally without StrictMode) for what jsdom cannot show: real iframes, CSP, DOM
  clobbering, navigation, pointer routing into frames, small viewports. The bootstrap script
  itself is also unit tested by running it in its own jsdom with scripts enabled.
