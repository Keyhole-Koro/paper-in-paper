# Paper in Paper Layout Specification

This document defines the layout engine specification that determines the spatial layout of paper nodes.

## Design Principles

- Prioritize direct user actions above automatic layout behavior
- Gradually shrink nodes that are left unused
- When space becomes constrained, shrink lower-importance nodes first
- Treat layout size as a derived value computed from importance

## Importance Model

Importance is managed as two separate state layers because it serves two different purposes.

- `accessMap`: last access timestamps, used for LRU decisions and auto-collapse candidate selection
- `importanceMap`: importance scores, used for display size ratios

Each paper node has an `importance` score.

### Initial Value

- When a node is created, its `importance` starts at a high initial value
- Newly created nodes appear large and shrink over time if they are not used

### Update Rules

- Expanding a node increases that node's `importance`
- Focusing a node increases that node's `importance`
- `importance` decays over time, initially slowly and then faster according to a quadratic rule: `importance *= (1 - decay_rate * t^2)`
- A parent's `importance` is the sum of the `importance` values of its children

### Minimum Size

- When `importance` falls below a threshold, automatic collapse is triggered
- The minimum size is the closed-card size that displays only the title
- Even when `importance` reaches zero, the node itself does not disappear

### Parent Importance

```text
importance(node) =
  self importance
  + sum(importance(child) for child in openChildIds)
```

Parent importance reflects how active its children are. A deeply nested active subtree therefore raises the importance of its ancestors as well.

## Size Determination

The display size of each node is derived from importance.

```text
size(node) = importance(node) / importance(parent) * size(parent)
```

- Higher-importance nodes are displayed larger
- Overall size is determined recursively
- Size is not authoritative state; it is recalculated from importance every time
- For leaf nodes, the base size comes from the content height reported by the iframe

## Grid Layout

Each room is divided into a grid and child nodes are placed inside it.

- Child node size is represented as a number of grid cells based on relative importance
- Positions manually assigned by the user take precedence
- If there is no manual placement, children are placed in descending order of importance

## Space Management

When room space becomes constrained, as determined by the layout engine:

- Lower-importance child nodes are collapsed first
- Collapsing a node means closing its expansion state by removing it from `openChildIds`
- Importance scores themselves are preserved after collapse so they are still available when the node is reopened

## User Action Priority

- If the user manually opens a node, exclude it from automatic collapse for a fixed period
- If the user manually places a node, automatic layout must not overwrite that position
