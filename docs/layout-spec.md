# Paper in Paper Layout Specification

How the canvas decides where every open paper goes and how big it is.

## Principles

- Direct user actions take priority over automatic layout.
- The layout is a pure function of the state and the canvas size: it changes when the reader
  does something or the data changes, never on its own.
- Papers that are left alone get smaller; when space runs out, the least important ones give
  way first.
- Sizes are derived, never stored.

## Attention

Every paper has an attention score. It is stored as a base value plus the clock value at
which it was set, and decays lazily:

```
attention(paper) = base × 0.5 ^ ((state.clock − setAt) / decayHalfLife)
```

`state.clock` is an **interaction clock**: it advances by one when the reader opens, focuses,
reveals, moves or reorders a paper, clicks an index label or creates a paper. So attention
decays with what the reader does elsewhere, not with time spent reading.

- A paper starts at `attention.initial` (or its `attentionScore`).
- Opening adds `openBonus`, focusing `focusBonus`, an index-label click `labelClickBoost`,
  each on top of the decayed value.
- Attention is kept when a paper closes, so a reopened paper picks up where it left off.

Attention turns into a size factor with a saturating curve:

```
multiplier = min + (max − min) × (1 − e^(−k × attention))    within [multiplierMin, multiplierMax]
```

## Demand

Each visible paper gets a demand:

```
content(paper) = base × contentFactor(paper) × contentImportance% × multiplier(attention)
room(paper)    = content(paper) + Σ room(child) × importance(child)    over visible children
```

- `base` is three header heights.
- `contentFactor` estimates how much the content needs, from the content itself (never from a
  measurement, which would feed back into the layout): visible text length (full-width
  characters count double), plus a fixed amount per image/media element and per table row,
  for HTML and structured content; React content counts as average. The factor is
  `sqrt(mass / 800)` clamped to [0.6, 2.2]. With `layout.contentDemand: 'uniform'` it is 1.
- An indexed paper has no content demand. An indexed paper with nothing open inside
  (indexed-leaf) takes no room at all.

Only *visible* edges count: a parent → child entry in the open state is followed only when the
child exists and its `parentId` is that parent, and each paper is visited once. Open state
from outside (restored, stale, even cyclic) therefore never loops or renders a paper twice.

## Splitting a room

A paper's room is its rect minus border and title bar. It is split between the paper's
content and its open children:

1. Shares start from demand. Each open child also gets a minimum share: the automatic one
   (`min(0.18, 0.72 / openChildren)`), its pin (`pinnedLayout.minShare`), and the parent's
   `childMinShares[child]`, whichever is largest. Minimums are honoured first; the remaining
   share is split by demand above them.
2. A parent with a `layout` function decides the shares itself (`contentShare`,
   `childShares`; children it leaves out split the rest). If the function throws or returns
   nothing usable, the default split is used.
3. The shares are packed in order (content first, then children in open order) into strips,
   keeping each strip's rects as square as possible. Strips run along the shorter side unless
   running them the other way gives clearly squarer rects (15% better), so the arrangement
   does not flip back and forth.
4. While some child is outside the aspect-ratio bounds, the least important unpinned child
   (lowest attention, then least recently touched) shrinks by 16%, up to 6 times.
5. Rects are rounded to whole pixels by their edges, so neighbours still meet exactly.

## Cramped rooms

An open child is **cramped** when it is narrower than its `minWidth` (default
`layout.minPaperWidth`, 160px), shorter than its `minHeight` (default
`layout.minPaperHeight`, 96px), or its height / width ratio is outside
[`minAspectRatio`, `maxAspectRatio`] (0.2–3).

## Space management

After every change, before rendering, the canvas settles space by applying one step at a
time and laying out again until no step applies:

1. **Stale index labels**: an indexed paper with nothing open inside whose attention has
   decayed to `autoCloseThreshold` or below is closed (0 disables this).
2. For each room with a cramped child that holds **at least two** papers that take room:
   1. **Index** the least important expanded child (its content moves to a label; its open
      children stay).
   2. If none is left, **close** the least important indexed child that still takes room.

A room's last paper is never taken away (that frees nothing for anyone). Papers are never
chosen while protected (just opened, revealed, created, restored or unindexed: for
`protectInteractions` interactions), pinned, or focused. Every step indexes or closes a paper,
so settling always ends.

## Index labels

Indexed papers show as tabs on the canvas's left edge, near the vertical position of their
rect, packed so they never overlap (shrinking when there are many). Clicking one brings the
paper back (`LABEL_CLICK_BOOST`).
