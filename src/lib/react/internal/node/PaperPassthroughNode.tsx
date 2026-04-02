// DELETED — passthrough optimization removed for simplicity.
//
// PASSTHROUGH REVIVAL GUIDE:
// When a node is open and has exactly one open child, the parent node can render
// in "passthrough" mode: skip its own header and border, and just act as a slim
// flex wrapper that delegates visual identity to the single open child.
//
// HOW IT WORKED:
//   - PaperNode checked: if (openChildIds.length === 1) → render PaperPassthroughNode
//   - PaperPassthroughNode rendered a motion.div with class "paper-node--passthrough"
//     (display:flex; flex-direction:column; gap:8px) and no background/border.
//   - It forwarded all drag handlers from the parent node.
//   - The single child PaperNode rendered normally inside it.
//   - layoutId was shared with the parent (paperId), so framer-motion animated the transition.
//
// WHY IT WAS USEFUL:
//   - Visually flattens the hierarchy when a parent has only one open child.
//   - Avoids redundant nested borders/backgrounds.
//
// TO REVIVE:
//   1. Restore this component (see git history for full implementation).
//   2. In PaperNode (open state), add:
//      if (openChildIds.length === 1) return <PaperPassthroughNode ... />
//   3. Add CSS: .paper-node--passthrough { display:flex; flex-direction:column; gap:8px; }
export {};
