# Paper in Paper Behavior Specification

This document fixes the reference interaction behavior for Paper in Paper.
Future design or implementation changes are expected to preserve the behaviors defined here unless this document is explicitly updated.

## Initial State

At startup, the application uses mock data as the initial state.

## Core Concept

Instead of showing a long document all at once, the system presents a recursive structure in which concepts inside the text can be expanded by clicking them.
The goal is to let readers actively widen or narrow their reading scope as needed.

Example: `The C language uses pointers.` Clicking `pointers` expands that concept.

## Scope

This specification defines:

- Tree structure and its invariants
- Expand and collapse behavior
- Size propagation behavior
- Space management through automatic collapsing
- Breadcrumb-based navigation
- Reordering via drag and drop

This specification does not fix:

- Detailed animation timing
- Visual styling such as colors, shadows, and spacing
- The exact number of grid divisions
- Internal component structure

## Tree Model

Data is treated as a normalized graph of paper nodes.

Paper nodes are classified into two categories:

- **Placed nodes**: nodes that appear in some parent's `childIds`
- **Unplaced nodes**: nodes that belong to no parent and are shown in the sidebar

Each paper contains:

- `id`
- `title`
- `description`
- `content`
- `parentId`
- `childIds`

Global state:

- `unplacedNodes`: an array of unplaced nodes displayed in the sidebar

Invariants:

- `id` is a random identifier and has no semantic meaning. Multiple nodes may share the same `title`
- Exactly one node has `parentId === null`, and that node is the root
- Every non-root node must belong to exactly one parent's `childIds` or to `unplacedNodes`
- The order of `childIds` is meaningful and must be preserved

## Content Model

Each paper's `content` may contain arbitrary HTML and CSS.

Content is rendered inside an iframe.

- The iframe fully isolates the paper's styles and JavaScript
- Links to child papers inside the content are expressed with the `data-paper-id` attribute

```html
<p>The C language uses <a data-paper-id="xxxx">pointers</a>.</p>
```

### Communication Between the Iframe and Its Parent

Events inside the iframe are sent to the parent via `postMessage`.

| Event | Sender | Payload |
| --- | --- | --- |
| Link click | iframe -> parent | `{ type: "open", paperId: "xxxx" }` |
| Link drag start | iframe -> parent | `{ type: "dragstart", paperId: "xxxx" }` |
| Content height change | iframe -> parent | `{ type: "resize", height: number }` |

- `childIds` is the source of truth, and `data-paper-id` entries in the content are only references to it
- A node may appear in `childIds` even if the content does not include a link to it

## Sidebar

The sidebar displays the list of unplaced nodes.

Behavior:

- Clicking the `+` button creates a new unplaced node and appends it to `unplacedNodes`
- Dragging a sidebar node into a room appends that node to the target parent's `childIds` and removes it from `unplacedNodes`
- Nodes cannot be dragged back from a room into the sidebar; changing parents is done by dragging between rooms

## Node Deletion

- Deleting a node recursively deletes its entire subtree
- Deleted nodes are removed from both `childIds` and `unplacedNodes`
- The root node cannot be deleted

## Room Model

Each paper node owns a "room" in which child papers are laid out spatially.

- The room is divided into a grid
- Child papers are placed on that grid
- Users can reposition children by dragging them

The paper node's content and its expanded child papers are displayed at the same time.

- The content text remains visible at all times
- When a child expands, it appears alongside the content
- Readers can inspect child content without losing the current context

Collapsed child nodes are shown inside the room as compact cards that display only the title.

- Clicking a card expands that node
- Hovering over a card shows its description in a popup
- Cards can be dragged to change their position within the room

## Expansion State Model

Expansion state is managed per parent.

Each parent may hold:

- `openChildIds`: the set of currently expanded child nodes

Global state:

- `focusedNodeId`: the id of the most recently operated node

Behavior:

- Expanding a child adds it to `openChildIds`
- Expanding a child updates `focusedNodeId` to that child
- Collapsing a child removes it from `openChildIds`
- Collapsing a child clears the expansion state of its entire subtree
- When a drag operation completes, `focusedNodeId` is updated to the moved node

## Size Propagation Model

The size of each paper node is a derived value, not authoritative state.

- A leaf node's size is determined by the amount of content it contains
- A parent node's size is determined by the layout result of its children inside the room

Propagation behavior:

- Expanding a child node increases its size
- That size increase propagates upward as a space requirement for the parent's room
- The requirement then continues upward through the ancestor chain toward the root

## Access Timestamps

Access timestamps are managed separately from expansion state.

Behavior:

- Expanding a node updates that node's access timestamp

## Space Management (Automatic Collapse)

The layout engine decides when a room is under pressure.

When space becomes constrained inside a room:

- Child nodes are collapsed in ascending order of recency, starting from the least recently accessed
- To collapse a node means to close it by clearing its expansion state

## Breadcrumb Behavior

Breadcrumbs display the ancestor chain from `focusedNodeId` to the root in the format `root / A / A1`.

- Even when multiple branches are expanded, only the currently focused branch is shown
- The display does not change based on whether sibling nodes are expanded

Behavior:

- Clicking the breadcrumb at index `i` closes the branch below that breadcrumb
- Clicking a breadcrumb sets `focusedNodeId` to the clicked node

Example:

- If `focusedNodeId` is `A1`, the breadcrumbs display `root / A / A1`
- Clicking `A` closes `A1` and updates `focusedNodeId` to `A`
- Clicking `root` closes `A` and updates `focusedNodeId` to `root`

## Drag: Repositioning Within a Room

Child nodes with the same parent can be freely rearranged inside that room. Both open and closed child nodes are draggable.

- The tree structure does not change
- Only the position within the grid changes

Indicators:

- Highlight the target grid position
- Show a line indicating the insertion position

### Dragging From a Content Link

A `data-paper-id` link inside the content can be dragged and dropped onto a room's grid.

- The iframe notifies the parent of a `dragstart` event via `postMessage`
- The parent shows the drop target on the room grid
- After drop, the target node is placed at the specified position and expanded by adding it to `openChildIds`

## Drag: Changing Parent

A node may be moved into another parent's room. This is a tree-structure change.

- Only non-root nodes may be moved
- The moved node's `parentId` is updated to the new parent
- The node is removed from the source parent's `childIds`
- The node is appended to the target parent's `childIds`
- Multiple nodes may still share the same title because identity is based on `id`

Indicators:

- Highlight the destination room while dragging

Expansion behavior during a move:

- If the moved node was expanded under the source parent, it is removed from the source parent's `openChildIds`
- The expansion state of the moved node's subtree is preserved

## Reconstruction Guidelines

- Tree state should be controllable from outside the component
- Expansion state should also be externally controllable
- Size should remain a derived value and must not become authoritative state
- Drag hit testing should not own tree state
- Each node should own its own space-propagation logic independently

Related documents:

- [React Architecture Considerations](./react-architecture-considerations.md)
- [Layout Specification](./layout-spec.md)
