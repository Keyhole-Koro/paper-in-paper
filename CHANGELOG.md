# Changelog

## 0.4.0

A robustness, performance and testing release. It changes the attention model and a few
public APIs; see "Migrating from 0.3".

### Fixed

- **Links to a parent (or any ancestor) crashed the canvas** with "Maximum call stack size
  exceeded". `OPEN_NODE` now only opens real children; links to other papers reveal them
  where they live (`REVEAL_NODE`), unknown ids are ignored. Layout and rendering only follow
  open-state entries that match the tree and visit each paper once, so restored or stale
  open state (including cycles saved before this fix) can no longer crash or duplicate papers.
- **Dragging a paper into its own child detached the subtree into a cycle.** The drop target
  now excludes the dragged paper's subtree, and `MOVE_NODE` / `ATTACH_UNPLACED_NODE` refuse
  such moves. `getDescendantIds` and the parent walks are cycle-safe.
- `MOVE_NODE` closed everything that was open inside the moved paper; it now keeps it, as
  the behavior spec says. It also honours the drop position in the visible order (it used to
  append the paper at the end whatever the insert indicator showed).
- `DELETE_NODE`: `lift` kept the lifted children's attention and open state; focus moves off
  deleted papers; protection and index state of removed papers is cleaned up.
- `CLOSE_NODE` / `AUTO_CLOSE_NODE` move focus out of what they hide and forget the indexed
  state below.
- The second stage of space management (closing indexed papers) never ran, and
  `autoCloseThreshold` had no effect. Both work now (see layout spec).
- Restored open state (`defaultOpenState`) was pruned by the first `paperMap` update when the
  papers had not loaded yet; it now waits for them.
- `findRootId` / an empty `paperMap` no longer throws.
- Drag: pointer cancel, Escape, window blur and unmounting end a drag cleanly; text selection
  is restored to what it was.
- Content-link drags started at the wrong position (iframe coordinates were used as page
  coordinates), and could not end: the browser keeps a gesture that starts in a frame inside
  that frame, so the canvas never saw the release. The frame now forwards moves, the release,
  Escape and pointer cancel; a press anywhere ends a drag whose release was lost.
- Reordering papers moved their elements in the DOM, which reloads every iframe inside them
  (scroll position, loaded images and, without StrictMode, the link wiring were lost).
  Children now keep a stable DOM order (the paper's `childIds`); `data-child-index` holds
  the layout order.
- Content frames no longer stay too tall when their content shrinks.

### Security

- HTML content frames get a content security policy: only the canvas's bootstrap script (by a
  per-document nonce) may run, so `<script>` and inline handlers in content do not execute,
  script cannot make network requests, and styles cannot load remote stylesheets or fonts.
- The bootstrap runs in `<head>`, before the content, and keeps its own references to the DOM
  functions it uses, so content cannot break it by clobbering (`<img name="addEventListener">`).
- Frames talk to the canvas over a private `MessageChannel` opened with a per-document
  secret; window messages are ignored. A frame whose document is not the canvas's own (it
  navigated, e.g. by `<meta http-equiv="refresh">`) or that keeps reloading is replaced by
  `labels.contentBlocked`. `http-equiv` pragmas are removed from content, and native drag and
  drop (which can navigate a frame) is off inside it.
- Titles and ids in the auto-appended "related" links are escaped.
- Image loads are limited to `data-file-id` markers present in the paper's content, and
  `loadImageUrl` receives `{ nodeId }` so hosts can scope them.
- Regular links in content no longer navigate the frame; they go to `onOpenExternalLink`
  (default: new tab, `http(s)`/`mailto` only).
- Frames no longer load Google Fonts (no third-party request per paper).

### Performance

- A new external store with per-paper subscriptions: a change re-renders only the papers it
  affects. Updating one paper from the host re-renders that paper only (it re-rendered every
  paper twice); pointer moves during a drag re-render no paper (every paper re-rendered on
  every frame).
- Space management settles in one pass before anyone renders, instead of one paper per
  render cycle.
- The layout is deterministic (interaction clock, whole-pixel rects), so unchanged papers
  keep their layout objects.
- Removed `REPORT_CONTENT_HEIGHT` and `contentHeightMap`, which re-laid out the canvas on
  every iframe resize without affecting the layout.

### Added

- `draggable`, `canDrop`, `colorScheme` (`'light' | 'dark' | 'system'`), `labels`
  (translatable UI strings), `onOpenExternalLink`, controlled `expansionMap` /
  `focusedNodeId` props.
- `PaperHtmlContent`: sandboxed HTML for embedding inside React content.
- Commands `REVEAL_NODE`, `CLOSE_CHILDREN`, `SET_PAPER_MAP`, `SET_OPEN_STATE`,
  `SET_UNPLACED`; `CREATE_*` accept an `id`; `reduce` accepts `{ createId }`.
- `checkTreeInvariants`, `handle.getSnapshot()`.
- Layout hints that were documented but ignored now work: `importance`,
  `contentImportance`, `childMinShares`, `layout`, `minWidth`, `minHeight`.
- Content-size-aware layout (`config.layout.contentDemand: 'estimate'`), minimum paper size
  and aspect-ratio settings, `config.content.fontSize`.
- Keyboard: paper titles are buttons (Enter focuses); Alt + arrow keys reorder siblings.
  Paper links inside HTML are focusable.
- `labels.contentBlocked`.
- Position and size now animate together.

### Changed (breaking)

- Peer dependencies: `react` and `react-dom` `^19` (the code already required React 19);
  they are no longer regular dependencies.
- Attention decays per interaction, not per second: `attention.decayHalfLifeMs` and
  `attention.protectDurationMs` are replaced by `decayHalfLife` and `protectInteractions`
  (counted in interactions). `PaperViewState` has a `clock`; `getEffectiveAttention` no longer
  takes a time.
- `REORDER_WITHIN_PARENT` takes `insertBeforeId` instead of a grid `position`, and reorders
  open papers only (view state).
- `LABEL_CLICK_BOOST` also unindexes, protects and focuses the paper.
- Removed: `isFullscreen` / `onFullscreenChange` props (never had an effect),
  `REPORT_CONTENT_HEIGHT`, `manualPlacementMap` / `contentHeightMap`, `ImportanceMap`,
  `useCanvasHandle().mutableRef`; `useCanvasHandle()` returns `{ ref, handle }` (was
  `{ ref, current }`).
- `LoadImageUrl` is `(fileId, { nodeId }) => Promise<string>`.
- Default UI strings changed ("Close paper", "Pin paper", ...); pass `labels` to translate.
- Content frames use the system font stack instead of Space Grotesk, a fixed base font size
  (`config.content.fontSize`, default 14) instead of one that grew with the content length,
  and are titled with the paper title (`data-paper-content-id` identifies them).

### Migrating from 0.3

- Remove `isFullscreen` / `onFullscreenChange`.
- If you replayed `OPEN_NODE` to restore open state after data loaded, drop that: pass the
  saved state as `defaultOpenState`.
- Rename attention config keys (`decayHalfLifeMs` → `decayHalfLife` in interactions,
  `protectDurationMs` → `protectInteractions`).
- `__SYNC_PAPER_MAP` / `__SYNC_OPEN_STATE` / `__SYNC_UNPLACED` still work but are deprecated in
  favour of `SET_PAPER_MAP` / `SET_OPEN_STATE` / `SET_UNPLACED`.

### Tooling

- Tests moved to `test/` (no longer shipped in `dist`), from 27 to 200+ cases: every command,
  layout properties, space management, randomized command sequences checked against the tree
  invariants, render counts, drag and drop, iframe messaging. Browser tests against the demo
  (`npm run test:e2e`).
- CI runs lint, type checks (library, demo, tests), unit tests, the build and the browser
  tests. Lint is clean under the React Compiler rules.
- Declarations carry `.js` extensions, so `moduleResolution: node16/nodenext` consumers get
  types; `exports` lists `types` first; `sideEffects: false`.
