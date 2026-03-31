import { buildPaperMap } from '../lib/core/tree';
import type { Paper, PaperMap } from '../lib/core/types';

const papers: Paper[] = [
  { id: 'root', title: 'Product Design', body: 'The top-level vision for the product.', parentId: null, childIds: ['ux', 'tech', 'biz'] },
  { id: 'ux', title: 'UX Design', body: 'User experience and interaction design principles.', parentId: 'root', childIds: ['ia', 'visual', 'proto', 'research', 'copy', 'motion', 'access', 'test', 'iterate'] },
  { id: 'tech', title: 'Technology', body: 'Technical architecture and implementation.', parentId: 'root', childIds: ['frontend', 'backend', 'infra'] },
  { id: 'biz', title: 'Business', body: 'Business strategy and metrics.', parentId: 'root', childIds: ['growth', 'monetize'] },
  { id: 'ia', title: 'Information Architecture', body: 'Structure and organization of content.', parentId: 'ux', childIds: ['sitemap', 'taxonomy'] },
  { id: 'visual', title: 'Visual Design', body: 'Color, typography, and layout systems.', parentId: 'ux', childIds: ['color', 'type'] },
  { id: 'proto', title: 'Prototyping', body: 'Low and high fidelity prototypes.', parentId: 'ux', childIds: [] },
  { id: 'research', title: 'User Research', body: 'Interviews, surveys, and usability tests.', parentId: 'ux', childIds: [] },
  { id: 'copy', title: 'Copywriting', body: 'Voice, tone, and microcopy.', parentId: 'ux', childIds: [] },
  { id: 'motion', title: 'Motion Design', body: 'Transitions and micro-interactions.', parentId: 'ux', childIds: [] },
  { id: 'access', title: 'Accessibility', body: 'WCAG compliance and inclusive design.', parentId: 'ux', childIds: [] },
  { id: 'test', title: 'Usability Testing', body: 'Testing with real users.', parentId: 'ux', childIds: [] },
  { id: 'iterate', title: 'Iteration', body: 'Continuous improvement cycles.', parentId: 'ux', childIds: [] },
  { id: 'frontend', title: 'Frontend', body: 'React, TypeScript, CSS.', parentId: 'tech', childIds: ['components', 'state', 'routing'] },
  { id: 'backend', title: 'Backend', body: 'API design and data modeling.', parentId: 'tech', childIds: [] },
  { id: 'infra', title: 'Infrastructure', body: 'Cloud, CI/CD, monitoring.', parentId: 'tech', childIds: [] },
  { id: 'components', title: 'Component Library', body: 'Reusable UI components.', parentId: 'frontend', childIds: [] },
  { id: 'state', title: 'State Management', body: 'Global and local state patterns.', parentId: 'frontend', childIds: [] },
  { id: 'routing', title: 'Routing', body: 'Client-side navigation.', parentId: 'frontend', childIds: [] },
  { id: 'sitemap', title: 'Sitemap', body: 'Page hierarchy and navigation.', parentId: 'ia', childIds: [] },
  { id: 'taxonomy', title: 'Taxonomy', body: 'Content classification system.', parentId: 'ia', childIds: [] },
  { id: 'color', title: 'Color System', body: 'Palette and semantic tokens.', parentId: 'visual', childIds: [] },
  { id: 'type', title: 'Typography', body: 'Font scale and text styles.', parentId: 'visual', childIds: [] },
  { id: 'growth', title: 'Growth', body: 'Acquisition and retention strategies.', parentId: 'biz', childIds: [] },
  { id: 'monetize', title: 'Monetization', body: 'Revenue models and pricing.', parentId: 'biz', childIds: [] },
];

export function buildDemoPaperMap(): PaperMap {
  return buildPaperMap(papers);
}
