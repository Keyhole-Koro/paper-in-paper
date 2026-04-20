import type { ExpansionMap, PaperId, PaperMap } from './types';
import { openChild, closeChild, getOpenChildIds } from './expansion';

export type ExpansionRule = (
  map: ExpansionMap,
  paperMap: PaperMap,
  nodeId: PaperId,
) => ExpansionMap;

// Apply multiple rules in sequence
export function applyRules(
  map: ExpansionMap,
  paperMap: PaperMap,
  nodeId: PaperId,
  ...rules: ExpansionRule[]
): ExpansionMap {
  return rules.reduce((m, rule) => rule(m, paperMap, nodeId), map);
}

// Open nodeId as a child of its parent (requires knowing parentId)
export function ruleOpen(parentId: PaperId): ExpansionRule {
  return (map) => openChild(map, parentId, parentId);
}

// Close all open children of nodeId
export const ruleCollapseChildren: ExpansionRule = (map, paperMap, nodeId) => {
  const openIds = getOpenChildIds(map, nodeId);
  return openIds.reduce((m, childId) => closeChild(m, paperMap, nodeId, childId), map);
};

// Close all open children of nodeId, then open a specific child
export function ruleCollapseAndOpen(childId: PaperId): ExpansionRule {
  return (map, paperMap, nodeId) => {
    const collapsed = ruleCollapseChildren(map, paperMap, nodeId);
    return openChild(collapsed, nodeId, childId);
  };
}

// Walk down the single-child chain from nodeId and close everything at the first branch point
// Use this to "break" a collapsed chain at nodeId
export const ruleBreakChainAt: ExpansionRule = (map, paperMap, nodeId) => {
  // Close nodeId's open children, which breaks the single-child chain at this node
  return ruleCollapseChildren(map, paperMap, nodeId);
};

// Ensure a node is visible by opening it from its parent
export function ruleEnsureOpen(parentId: PaperId, childId: PaperId): ExpansionRule {
  return (map) => openChild(map, parentId, childId);
}
