# Paper in Paper Layout Specification

This document defines the layout engine specification that determines the spatial layout of paper nodes.

## Design Principles

- Prioritize direct user actions above automatic layout behavior
- Gradually shrink nodes that are left unused
- When space becomes constrained, shrink lower-attention nodes first
- Treat layout size as a derived value computed from attention

## Attention Model

Attention is managed as two separate state layers because it serves two different purposes.

- `accessMap`: last access timestamps, used for LRU decisions and auto-collapse candidate selection
- `attentionMap`: attention scores, used for display size ratios

Each paper node has an `attention` score.

### Initial Value

- When a node is created, its `attention` starts at a high initial value
- Newly created nodes appear large and shrink over time if they are not used

### Update Rules

- Expanding a node increases that node's `attention`
- Focusing a node increases that node's `attention`
- `attention` decays over time, initially slowly and then faster according to a quadratic rule: `attention *= (1 - decay_rate * t^2)`
- A parent's `attention` is the sum of the `attention` values of its children

### Minimum Size

- When `attention` falls below a threshold, automatic space management is triggered
- The first stage of reduction is "Content Indexing", where the node's body content is hidden but the header and child nodes remain visible
- If space remains constrained after content indexing, the second stage is "Auto Close", where the node is completely closed and converted into a compact title-only card
- Even when `attention` reaches zero, the node itself does not disappear

### Parent Attention

```text
attention(node) =
  self attention
  + sum(attention(child) for child in openChildIds)
```

Parent attention reflects how active its children are. A deeply nested active subtree therefore raises the attention of its ancestors as well.

## Size Determination

The display size of each node is derived from attention.

```text
size(node) = attention(node) / attention(parent) * size(parent)
```

- Higher-attention nodes are displayed larger
- Overall size is determined recursively
- Size is not authoritative state; it is recalculated from attention every time
- For leaf nodes, the base size comes from the content height reported by the iframe

## Grid Layout

Each room is divided into a grid and child nodes are placed inside it.

- Child node size is represented as a number of grid cells based on relative attention
- Positions manually assigned by the user take precedence
- If there is no manual placement, children are placed in descending order of attention

## Space Management

When room space becomes constrained, as determined by the layout engine:

- Lower-attention child nodes are adjusted first
- Space management occurs in two stages to maximize layout stability:
    1. **Content Indexing**: Hide the iframe content of the candidate node. This preserves the node's position and its children's presence, minimizing visual movement.
    2. **Auto Close**: Fully close the node by removing it from `openChildIds`. This recovers the full area occupied by the node's frame.
- Attention scores themselves are preserved after collapse so they are still available when the node is reopened

## Manual Resize

A user can resize a paper directly by dragging the grip on one of its edges. Manual size is
authoritative: it bypasses the attention -> demand -> share pipeline entirely.

- A resized node holds a fixed `share` of its parent room, stored in `manualSizeMap`
- A node's content area can be sized the same way against its own children, stored in `manualContentSizeMap`
- The remaining area is redistributed to the demand-driven items in that room
- Manual shares are clamped to `[MIN_MANUAL_SHARE, MAX_MANUAL_SHARE]`, and their sum inside one
  room is capped at `MAX_MANUAL_SHARE_TOTAL` so demand-driven siblings always keep a usable slice.
  The cap is applied to the incoming resize as it is accepted, never by rescaling the shares
  already set — see **A hand-set size holds until it is reset** below.
- The shrink fallback never targets a manually sized node, and stands down entirely in a split room
- A manually sized node is never selected as a Content Indexing / Auto Close candidate
- Double-clicking the grip clears the manual size and returns the node to automatic sizing
- The share is dropped when the node changes parents, since it described one specific room

### A hand-sized room becomes a split

The squarified packer decides positions from *area*, and its row breaks make a small share change
flip a rect from a wide block into a narrow column. That is fine for automatic layout and useless
for direct manipulation, so a room the user has sized by hand switches to a **single-axis split**:
one item per row, laid out along the room's dominant axis — side by side in a wide room, stacked
in a tall one. In that mode a dragged edge lands exactly under the pointer.

A room is in split mode exactly while it holds a manual share, whatever it holds and however many
items it holds. Nothing else feeds the decision, so the mode cannot change under the user's
pointer — and a room that later gains a child stays split rather than re-packing the hand-sized
rect into a different shape. The cost is that a room with many open children and a manual share
becomes a narrow strip; double-clicking a grip hands it back to the packer.

Entering split mode does move things once: a rect that was a wide block becomes a column of the
same area. That snap happens on pointer-down, before the pointer moves, so the drag itself still
tracks the pointer exactly.

A room in split mode is treated as user-managed: the shrink fallback and the overflow signal both
stand down for it, so narrow columns the user asked for are not treated as pressure to index the
siblings away.

### A hand-set size holds until it is reset

Once a rect has a manual share, nothing in the automatic machinery may change its size. Concretely
it survives attention decay, a sibling being focused, opened, closed or auto-indexed, a sibling
being resized by hand, and the room gaining or losing children. Only `RESET_NODE_SIZE` /
`RESET_CONTENT_SIZE` — the grip's double-click — give it back to the layout engine.

Two mechanisms uphold this:

- A resize takes its space from the demand-driven pool, and when that runs out the *incoming*
  resize is capped (`getAvailableManualShare`). Manual shares already set are never rescaled to
  make room for a new one.
- Split mode is held for as long as any manual share survives, so the rect is never re-packed into
  a new shape.

The one case that still moves a hand-set size is a room whose items are *all* manual and do not
add up to the whole room: the room has to be tiled completely, so the leftover is spread across
them in proportion. Reaching it takes manually sizing every open child of a room whose own content
is manual or indexed.

While a grip is being dragged, iframes across the page stop taking pointer events. A paper's
content can be an iframe, and an iframe hit-test swallows the pointer: without this the drag dies
silently the moment it crosses one — pointer capture on the grip does not help, because the capture
lives in the outer document and the hit-test never reaches it.

A divider is shared by the two rects it separates, so it carries a grip on each side; each grip
resizes the rect it belongs to. Grips otherwise only appear on edges that face a sibling — an edge
flush against the room boundary has nothing to trade area with. The exception is a manually sized
rect: it keeps a grip even when it is flush all round, because sizing it up far enough can push
its siblings into Content Indexing and leave it with no edge to drag back.

## User Action Priority

- If the user manually opens a node, exclude it from automatic collapse for a fixed period
- If the user manually places a node, automatic layout must not overwrite that position
- If the user manually resizes a node, automatic space management must not resize or collapse it
