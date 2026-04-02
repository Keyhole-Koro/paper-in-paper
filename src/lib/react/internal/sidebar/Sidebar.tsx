// DELETED — sidebar and LRU eviction removed.
//
// The sidebar showed nodes that were evicted from the main canvas when the
// open-node count exceeded maxOpenNodes (3/5/8 based on canvas width).
// Evicted nodes were tracked in sidebarMap (Map<PaperId, SidebarPlacement>)
// using an LRU order. Clicking a sidebar card returned the node to the canvas.
//
// TO REVIVE: see git history for Sidebar.tsx, SidebarPlacement/SidebarMap types,
// and the LRU effects + eviction logic in PaperCanvas.tsx.
export {};
