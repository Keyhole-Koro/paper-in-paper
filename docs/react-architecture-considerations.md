# Paper in Paper React / TypeScript Implementation Guidelines

This document defines the responsibility split for implementing the [Behavior Specification](./behavior-spec.md) and [Layout Specification](./layout-spec.md) in React and TypeScript.

The document has three goals:

- Make it possible to implement tree, expansion, layout, and drag logic without mixing concerns
- Clearly separate derived values from authoritative state
- Preserve an externally controllable API suitable for a reusable library

## Implementation Notes

- The initial implementation should be centered on React and TypeScript
- Introduce Rust/WASM for performance only after profiling identifies real bottlenecks
- If Rust/WASM is introduced, prioritize pure functions such as importance calculation, grid placement, pressure evaluation, and auto-close candidate selection rather than moving the whole UI

## Implementation Principles

- Keep tree state as authoritative state
- Keep expansion state independent from tree state
- Compute size, grid spans, and pressure decisions as derived values
- Pass iframe events into React through an adapter instead of coupling directly to DOM handlers
- Treat drag hit testing as transient state and keep it out of the tree-state reducer
- UI components should act through commands rather than depending directly on reducer details
- When updating a `Map` in a reducer, always return a new instance with `new Map(...)` because React detects changes by reference equality and mutating an existing `Map` will not trigger rerendering

## Recommended Directory Structure

```text
src/
  lib/
    core/
      types.ts
      tree.ts
      expansion.ts
      access.ts
      importance.ts
      layout.ts
      derived.ts
      commands.ts
    react/
      PaperCanvas.tsx
      context/
        PaperStoreContext.tsx
        LayoutContext.tsx
        DragContext.tsx
      components/
        PaperNode.tsx
        PaperRoom.tsx
        PaperContentFrame.tsx
        ChildCard.tsx
        Breadcrumbs.tsx
        Sidebar.tsx
        FloatingLayer.tsx
      hooks/
        usePaperStore.ts
        usePaperCommands.ts
        usePaperLayout.ts
        useIframeBridge.ts
        useDragSession.ts
      internal/
        iframeBridge.ts
        hitTest.ts
        autoClose.ts
```

Keep `core` independent from React. The `react` layer should handle rendering, event wiring, and DOM measurement only.

## Type Design

The following is enough for the minimum authoritative model.

```ts
export type PaperId = string;

export interface PaperNodeRecord {
  id: PaperId;
  title: string;
  description: string;
  content: string;
  parentId: PaperId | null;
  childIds: PaperId[];
}

export type PaperMap = Map<PaperId, PaperNodeRecord>;

export interface NodeExpansion {
  openChildIds: PaperId[];
}

export type ExpansionMap = Map<PaperId, NodeExpansion>;

export type UnplacedNodeIds = PaperId[];

export type AccessMap = Map<PaperId, number>;

export type ImportanceMap = Map<PaperId, number>;

export interface GridPosition {
  x: number;
  y: number;
}

export interface ManualPlacement {
  positions: Map<PaperId, GridPosition>;
}

export type PlacementMap = Map<PaperId, ManualPlacement>;
```

The following auxiliary state should also exist:

- `focusedNodeId`
- `unplacedNodeIds`
- `accessMap`
- `manualPlacementMap`
- `contentHeightMap`
- `protectedUntilMap`

`contentHeightMap` and `protectedUntilMap` may look UI-specific, but they should live in the store because they are used for layout and automatic collapse decisions.

## Store Design

The recommended store shape is `useReducer` plus Context, or an architecture that exposes reducers to support external control.

```ts
export interface PaperViewState {
  paperMap: PaperMap;
  expansionMap: ExpansionMap;
  unplacedNodeIds: PaperId[];
  focusedNodeId: PaperId | null;
  accessMap: AccessMap;
  importanceMap: ImportanceMap;
  manualPlacementMap: PlacementMap;
  contentHeightMap: Map<PaperId, number>;
  protectedUntilMap: Map<PaperId, number>;
}
```

Actions should be defined by semantic intent rather than raw UI events.

- `CREATE_UNPLACED_NODE`
- `DELETE_NODE`
- `OPEN_NODE`
- `CLOSE_NODE`
- `FOCUS_NODE`
- `MOVE_NODE`
- `REORDER_WITHIN_PARENT` with payload `{ parentId, paperId, position: GridPosition }`
- `ATTACH_UNPLACED_NODE`
- `REPORT_CONTENT_HEIGHT`
- `TICK_IMPORTANCE`
- `AUTO_CLOSE_NODE`

Hover positions and pointer coordinates during drag should not enter the reducer. They change every frame and should remain inside React state or refs.

## Separation of Reducer Responsibilities

One top-level reducer is acceptable, but its internal logic should still be split.

1. `treeReducer`
2. `expansionReducer`
3. `focusReducer`
4. `importanceReducer`
5. `placementReducer`

At the top level, each action is applied to these reducers in order.

This structure keeps the side-effect-like updates required by `MOVE_NODE` in one place:

- Remove the node from the source parent's `childIds`
- Insert the node into the target parent's `childIds`
- Update `parentId`
- Remove the node from the source parent's `openChildIds`
- Preserve the moved node's subtree expansion state
- Update `focusedNodeId`

## Derived Selectors

Values that are recalculated before rendering should live in selectors.

- `selectRootId`
- `selectBreadcrumbs(focusedNodeId)`
- `selectOpenChildren(parentId)`
- `selectClosedChildren(parentId)`
- `selectVisibleChildren(parentId)`
- `selectNodeImportance(nodeId)`
- `selectNodeSize(nodeId)`
- `selectRoomLayout(parentId, roomRect)` where `roomRect` is measured with `ResizeObserver` plus `useLayoutEffect`
- `selectAutoCloseCandidates(parentId)`

Instead of passing raw `Map` instances directly into the UI, convert them into a `PaperNodeViewModel` through selectors so recursive rendering stays simple.

## Component Responsibilities

### `PaperCanvas`

This is the public entry point of the library. Its responsibilities are:

- Connect external props to the internal store
- Render the root node
- Place the sidebar, floating layer, and breadcrumbs
- Support both controlled and uncontrolled usage

Keep the public props minimal.

```ts
interface PaperCanvasProps {
  paperMap: PaperMap;
  rootId?: PaperId;
  expansionMap?: ExpansionMap;
  unplacedNodeIds?: PaperId[];
  focusedNodeId?: PaperId | null;
  onPaperMapChange?: (paperMap: PaperMap) => void;
  onExpansionMapChange?: (expansionMap: ExpansionMap) => void;
  onFocusedNodeIdChange?: (paperId: PaperId | null) => void;
  onUnplacedNodeIdsChange?: (ids: PaperId[]) => void;
  layoutOptions?: LayoutOptionsInput;
}
```

To satisfy the requirement in `behavior-spec.md` that the system be externally controllable, at minimum the tree and expansion states should support controlled usage.

### `PaperNode`

This is the recursive component. Limit its responsibility to one node boundary.

- Render the header
- Render the content iframe
- Render the children inside the room
- Connect drag source and drop target behavior for that node
- Pass the required props down to descendants

`PaperNode` must not reconstruct global state by itself. It should receive the required information through selectors and command hooks.

### `PaperContentFrame`

This is the iframe-specific adapter. Its responsibilities are:

- Inject content via `srcDoc` or document writing
- Set up event delegation for `data-paper-id` elements inside the iframe
- Watch height changes with `MutationObserver` and `ResizeObserver`
- Normalize iframe events and pass them back to the parent

To avoid tightly coupling the iframe to React components, normalize events into the following union.

```ts
type PaperContentEvent =
  | { type: 'open'; paperId: PaperId }
  | { type: 'dragstart'; paperId: PaperId; clientX: number; clientY: number }
  | { type: 'resize'; height: number };
```

### `PaperRoom`

This component is responsible only for grid placement of children.

- Render expanded child nodes
- Render collapsed child nodes as compact cards
- Render drop indicators
- Perform hit testing at the room level

The room must not change the tree on its own. It should call commands only after a drop is confirmed.

### `Sidebar`

This component is dedicated to unplaced nodes. Its responsibilities can stay simple:

- Render the `unplacedNodeIds` list
- Render the create button
- Provide the drag source from the sidebar into a room

The rule that nodes cannot be moved back from a room to the sidebar should also be enforced on the command side.

### `Breadcrumbs`

Keep this as a pure component that derives the ancestor chain from `focusedNodeId`.

- Show only the focused branch
- Close the branch below the clicked node when a breadcrumb is clicked
- Update `focusedNodeId` after the click

## Iframe Integration

Because content allows arbitrary HTML and CSS, isolating it in an iframe is appropriate. The implementation should fix the following:

1. React generates `srcDoc`
2. A bootstrap script inside the iframe delegates interactions on `data-paper-id` links
3. Parent-child communication is limited to `postMessage`

Messages from the iframe must always be validated.

- `event.source === iframe.contentWindow`
- `event.data` matches the expected union
- `paperId` exists either in the current node's `childIds` or in the known node set

Since content links are only references, it is acceptable to ignore unknown `data-paper-id` values.

## Drag and Drop Design

Prefer a custom pointer-event-based implementation over HTML5 drag and drop for the following reasons:

- It is easier to absorb drag starts originating from the iframe
- Gap and surface indicators can be controlled more precisely
- Touch support is easier

The following drag session model is sufficient.

```ts
interface DragSession {
  draggedPaperId: PaperId;
  sourceParentId: PaperId | null;
  mode: 'reorder' | 'move-parent' | 'attach-unplaced' | 'content-link';
  pointer: { x: number; y: number };
  insertTarget: {
    parentId: PaperId;
    insertBeforeId: PaperId | null;
    kind: 'gap' | 'surface';
  } | null;
}
```

Hit testing should be computed from the room DOM rect and each child rect on demand. Pass only the result into `FloatingLayer`.

### Bridging Content-Link Drag

Pointer events inside the iframe do not bubble into the parent document, so `content-link` drag should follow this flow:

1. Detect `pointerdown` on a `data-paper-id` element inside the iframe
2. Send `postMessage({ type: 'dragstart', paperId, clientX, clientY })` to the parent
3. The parent's `useIframeBridge` receives the message and starts a drag session in `DragContext`
4. Continue with the normal pointer-event-based drag-and-drop flow

After drag start, pointer tracking runs on the parent document's `pointermove` and `pointerup`, so iframe boundaries no longer matter.

## Layout Engine Placement

Do not leave layout inside a React component's `useMemo`. Extract it into a set of pure functions.

- `computeImportance`
- `decayImportance`
- `computeNodeFootprint`
- `computeGridMetrics`
- `placeChildren`
- `resolvePressure`

Recommended flow:

1. Read leaf baseline heights from `contentHeightMap`
2. Compute effective importance from `importanceMap` plus open state
3. Sort open children by importance
4. Lock in manually placed children first
5. Pack the rest into the grid with auto layout
6. If they do not fit, return auto-collapse candidates from `resolvePressure`

The layout functions should not execute the actual automatic collapse. That belongs in the command layer.

## Importance and Automatic Collapse

The importance model in `layout-spec.md` needs more than access timestamps alone, so the implementation should split it into two layers:

- `accessMap` for LRU decisions
- `importanceMap` for size ratio calculations

Update rules:

- Increase importance on `OPEN_NODE`
- Increase importance on `FOCUS_NODE`
- Run `TICK_IMPORTANCE` periodically
- Aggregate parent importance from children in selectors

### `TICK_IMPORTANCE` and Rerendering

Because `TICK_IMPORTANCE` updates the entire `importanceMap`, it risks changing the map reference and rerendering the whole tree.

To avoid that:

- Do not recreate entries for nodes whose values did not change during a tick
- Components that depend on importance should subscribe through node-level selectors instead of receiving the whole `importanceMap`

### When to Fire `AUTO_CLOSE_NODE`

After `resolvePressure` returns candidates, watch layout results in `useEffect` and dispatch `AUTO_CLOSE_NODE` there. Dispatching during render would create a loop.

```ts
useEffect(() => {
  const candidates = selectAutoCloseCandidates(state, roomRect);
  candidates.forEach(id => dispatch({ type: 'AUTO_CLOSE_NODE', nodeId: id }));
}, [layoutResult]);
```

Choose automatic collapse candidates using the following rules:

1. Exclude nodes whose `protectedUntilMap` timestamp is still in the future
2. Consider only open children
3. Sort by ascending importance, then by oldest access when tied
4. Repeat until closing nodes resolves the pressure

Nodes that the user has just opened manually should remain protected for a fixed period.

## Subtree Handling on Close

By specification, closing a child node must also clear the expansion state of the subtree below it.

Therefore, `CLOSE_NODE(parentId, childId)` is not just an `openChildIds` update. It must DFS through the descendants under `childId` and remove their expansion state as well.

By contrast, `MOVE_NODE` must preserve the expansion state below the moved node.

Reducers should encode this difference explicitly.

## Controlled / Uncontrolled API

The library should default to uncontrolled behavior while still allowing external control.

- `paperMap` and `onPaperMapChange`
- `expansionMap` and `onExpansionMapChange`
- `focusedNodeId` and `onFocusedNodeIdChange`
- `unplacedNodeIds` and `onUnplacedNodeIdsChange`

The internal store should sit behind a thin adapter equivalent to `useControllableState`.

This makes it easier for applications to add persistence, undo/redo, or collaboration later.

## Performance Policy

- `PaperNode` should assume `React.memo`
- Selectors should support node-level subscriptions
- Keep pointer coordinates for drag in refs so the whole tree does not rerender
- Throttle iframe resize notifications with `requestAnimationFrame`
- Ignore `contentHeightMap` updates when the delta is below a threshold

Because trees can become deep, avoid implementations in which changing the whole store rerenders every node.

## Testing Policy

Test `core` with unit tests and `react` with integration tests.

Minimum required `core` cases:

- Root uniqueness and parent-child consistency
- Subtree expansion removal on open and close transitions
- Subtree expansion preservation on parent moves
- Attach from unplaced state
- Cascading deletion
- Importance decay
- Auto-close ordering used to resolve pressure

Minimum required `react` cases:

- Open on link click inside an iframe
- Height updates on iframe resize notifications
- Branch close on breadcrumb click
- Reorder via child-card drag
- Parent change via node drag
- Attach from sidebar to room

## Implementation Order

Do not implement everything at once. The recommended sequence is:

1. `core/types.ts`, `tree.ts`, `expansion.ts`, `commands.ts`
2. Uncontrolled `PaperCanvas` plus recursive `PaperNode`
3. `PaperContentFrame` and the iframe bridge
4. Sidebar and unplaced-node support
5. Pointer-based drag and drop
6. Importance, layout, and auto-close
7. Controlled API and persistence boundary

## Decision Criteria

When a design decision is unclear, prioritize the following:

- Do not break the tree
- Do not confuse subtree handling between close and move operations
- Do not store size in state
- Do not mix iframe responsibilities with React responsibilities
- Do not put transient drag information into the store

If these conditions are preserved, the core behavior will remain stable even if implementation details change.
