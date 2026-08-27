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

A room is laid out from a **split**: a stack of rows, each holding a run of panes. That is exactly
the shape the squarified packer already produces, so every room has one — the packer proposes it
while the room is automatic, and the user takes it over by dragging.

- Each pane edge that falls on a divider grows a grip; dragging it moves that divider
- The first drag stores the room's split in `roomSplitMap` verbatim, so nothing moves except the
  divider being dragged — the arrangement on screen is already the split being frozen
- From then on that room lays out from its split rather than from attention-derived demand
- A drag moves only the two panes the divider separates. A divider between rows moves whole rows;
  a divider inside a row moves just those two panes
- The two panes touching a divider both carry a grip for it, so it can be grabbed from either side
- Double-clicking any grip clears the room's split and hands it back to the packer

### A hand-arranged room holds until it is reset

Nothing in the automatic machinery may change a room the user has arranged. It survives attention
decay, siblings being focused, opened, closed or auto-indexed, and other dividers being dragged.
Only `RESET_ROOM_SPLIT` gives it back to the layout engine.

A split room is treated as user-managed: the shrink fallback and the overflow signal stand down for
it, and none of its children is an auto-index or auto-close candidate — narrow panes there are what
the user dragged, not pressure to collapse something.

### Reconciling with a changing tree

The stored split is lined up with the room's current items on every layout pass:

- Items that went away — a child closed, indexed to a label, moved to another paper, or deleted —
  are dropped, and their space goes to the rest of their row in proportion
- Items that appeared are appended as a new row sized like an equal share of the room, which leaves
  the panes the user already arranged recognisable
- A split with nothing left in it is dropped, and the room goes back to the packer

### Panes never collapse

A drag is clamped so both panes keep at least `MIN_PANE_RATIO` of the pair, which keeps every
divider grabbable and every pane recoverable without a reset.

## User Action Priority

- If the user manually opens a node, exclude it from automatic collapse for a fixed period
- If the user manually places a node, automatic layout must not overwrite that position
- If the user arranges a room by hand, automatic space management must not resize or collapse
  anything in it
