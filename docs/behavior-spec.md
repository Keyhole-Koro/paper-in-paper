# Paper in Paper Behavior Specification

This document fixes the reference interaction behavior for Paper in Paper. Changes to the
design or implementation are expected to preserve it unless this document is updated.

## Core Concept

Instead of showing a long document all at once, the canvas presents a recursive structure
in which concepts inside the text can be expanded by clicking them, so readers widen or
narrow their reading scope as they need.

Example: `The C language uses pointers.` Clicking `pointers` opens that concept inside the
current paper, next to the text that mentioned it.

## Tree Model

Data is a normalized map of papers. Each paper has `id`, `title`, `description`, `content`,
`parentId` and `childIds`.

Invariants (checked by `checkTreeInvariants`):

- `id` is an opaque identifier; titles may repeat.
- Exactly one placed paper has `parentId === null`: the root. Unplaced papers (in
  `unplacedNodeIds`) are parentless too but are not part of the tree.
- Every other paper appears in exactly one parent's `childIds`, and its `parentId` names
  that parent.
- The parent chain never loops.
- The order of `childIds` is meaningful and preserved.

No command can break these invariants: commands that would (moving a paper into its own
subtree, attaching a placed paper, opening a non-child) are ignored.

## Content Model

`content` is an HTML string, a React node, or structured `ContentNode[]`.

- HTML renders in a sandboxed iframe whose content security policy only allows the canvas's
  bootstrap script (by nonce); scripts and inline handlers in the content do not run, nothing
  in the frame can make network requests from script, and CSS cannot load remote stylesheets
  or fonts. `http-equiv` pragmas are removed from the content.
- A frame that shows anything but its own document (it navigated) or keeps reloading is
  replaced by `labels.contentBlocked` until the content changes.
- An element with `data-paper-id="<id>"` links to a paper. A link to a **child** opens it
  inside the paper. A link to any **other known paper** (an ancestor, a sibling, a paper in
  another branch) reveals that paper where it lives in the tree and focuses it. Unknown ids
  are ignored.
- Children the HTML does not link to are appended as links under a "Related" heading, so every
  child stays reachable.
- `childIds` is the source of truth; links are references.

### Iframe ⇄ canvas messages

The bootstrap runs in `<head>`, before the content. It opens a `MessageChannel` and posts
`{ type: 'pip:hello', secret }` with one port to the parent window; every other message
travels over that port. The canvas adopts a port only from a hello whose source is the frame's
current window and whose secret is the one built into the frame's current document (each
document gets a new secret and CSP nonce).

| Event | Direction | Payload |
| --- | --- | --- |
| Link click / Enter | frame → canvas | `{ type: 'open', paperId }` |
| Link dragged past 5px | frame → canvas | `{ type: 'dragstart', paperId, clientX, clientY }` (frame coordinates) |
| Pointer moved during that drag | frame → canvas | `{ type: 'dragmove', clientX, clientY }` |
| Pointer released | frame → canvas | `{ type: 'dragend', clientX, clientY }` |
| Escape / pointer cancel | frame → canvas | `{ type: 'dragcancel' }` |
| Content height changed | frame → canvas | `{ type: 'resize', height }` |
| Image marker found | frame → canvas | `{ type: 'loadImage', fileId }` |
| Regular link clicked | frame → canvas | `{ type: 'openExternal', href }` |
| Answer to a ping | frame → canvas | `{ type: 'pong', seq }` |
| Document going (`pagehide`) | frame → canvas | `{ type: 'leaving' }` |
| Open children changed | canvas → frame | `{ type: 'setOpenIds', openIds }` |
| Image URL ready | canvas → frame | `{ type: 'setImageUrl', fileId, url }` |
| Liveness check | canvas → frame | `{ type: 'ping', seq }` |

A gesture that starts in a frame stays in that frame, so the frame forwards it; the canvas
converts frame coordinates to the page and only lets the frame that started a drag move, drop
or cancel it.

After every hello, every load of the frame and every `leaving`, the canvas pings the current
port. Unless a document of the canvas's own answers within 1.5 s, the frame shows something
else (it navigated) and is replaced by `labels.contentBlocked`. `leaving` matters for pages
that never finish loading: they never fire `load`. So is a document that loads more than six times in ten
seconds (a refresh loop). Message shapes are validated; image loads are honoured only for
`data-file-id` markers present in that paper's content; external links are handed to the host
(`http(s)` and `mailto` only).

## Room Model

Each paper owns a room below its title bar. The paper's own content and its open children
share the room (see the layout spec); the content stays visible next to opened children.
Closed children are not drawn; they are reached through links in the content.

## Expansion

Each parent keeps the ordered list of its open children (`openChildIds`); that order is the
layout order. The children's elements keep the paper's `childIds` order in the DOM whatever
the layout order (moving an element would reload the frames inside it); `data-child-index`
gives each child's place in the layout, and keyboard focus follows the DOM order.

- Opening a child appends it to the list, focuses it, and shields it from space management for
  a few interactions.
- Closing a child removes it and forgets everything that was open below it.
- If the focused paper was inside what got closed, focus moves to the closing parent.
- Open state may name papers that have not loaded yet (a restored view); it takes effect when
  they arrive, and they are shielded like newly opened papers.

## Focus

`focusedNodeId` is the paper the reader is working with. Pressing a paper's title bar
focuses it; so does opening, revealing, moving or reordering it. Keyboard: paper titles are
buttons, Enter focuses.

## Headers and Breadcrumbs

A paper's title bar shows its parent's title, a separator, and its own title.

- Clicking the parent's title closes everything open in the parent and focuses the parent.
- Pin keeps the paper at least at its current share of the room; ✕ closes it and focuses
  the parent; + (when the host supports it) creates a child.

## Space Management

When a room gets cramped, papers give way in two stages: first the least important paper's
content folds into an index label (its open children stay); if that is not enough, an
indexed paper that still takes room is closed. Recently touched, pinned and focused papers
are left alone, and a room's last paper is never taken away. Indexed papers that have been
ignored for long (attention at or below `autoCloseThreshold`) are closed to keep the index
short. Clicking an index label brings its paper back. Details in the layout spec.

## Drag and Drop

Papers are dragged by their title bar (not when `draggable` is false).

- Dropped on another paper's **body**, the paper moves inside that paper (a tree change,
  reported through `onPaperMapChange`).
- Dropped on a paper's **title bar**, or on free space in a room, it is placed next to that
  paper in that room: before it from the leading half, after it from the trailing half.
- Within the same room this is a reorder of the open papers only (view state); the tree does
  not change.
- A paper can never be dropped into itself or its own subtree; those rooms are not targets.
- A host can veto any target with `canDrop`.
- The target room is outlined and a line shows the insert position. Escape, a cancelled
  pointer or the window losing focus end the drag without dropping.
- A child link dragged out of the content works the same way; dropped in its own parent's
  room it opens there.
- Moving a paper keeps everything that was open inside it; changing parent clears its pin.
- Keyboard alternative: Alt + arrow keys on a paper's title move it among its open siblings.

## Deletion

- `cascade` removes the paper and everything below it; `lift` removes only the paper and
  moves its children up into its place (open children stay open).
- The root cannot be deleted. Focus moves off deleted papers.

## Reconstruction Guidelines

- Tree, open state and focus can be controlled from outside.
- Sizes are derived, never stored.
- Drag hit testing never owns tree state.
- Invalid input degrades to "nothing happens", never to a broken tree or a crash.

Related documents:

- [Layout Specification](./layout-spec.md)
- [Commands](./commands.md)
- [React Architecture](./react-architecture-considerations.md)
