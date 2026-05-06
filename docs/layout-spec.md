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

## User Action Priority

- If the user manually opens a node, exclude it from automatic collapse for a fixed period
- If the user manually places a node, automatic layout must not overwrite that position
