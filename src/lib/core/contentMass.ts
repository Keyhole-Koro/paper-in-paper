import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import type { ContentNode, Paper, PaperContent } from './types';

/**
 * Content "mass": a width-independent estimate of how much a paper's content needs to show,
 * in Latin-character equivalents. It is computed from the content itself, never from a
 * measurement, so it cannot feed back into the layout that would change the measurement.
 */

/** Mass at which a paper's own content gets the base demand (factor 1). */
export const REFERENCE_CONTENT_MASS = 800;
/** Mass assumed for React content, which cannot be inspected. */
export const REACT_CONTENT_MASS = REFERENCE_CONTENT_MASS;
const MEDIA_MASS = 400;
const TABLE_ROW_MASS = 40;
const CARD_MASS = 80;
const MIN_FACTOR = 0.6;
const MAX_FACTOR = 2.2;

/** Full-width (CJK) characters take about twice the room of Latin ones. */
function textMass(text: string): number {
  let mass = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20) continue;
    mass += code >= 0x2e80 ? 2 : 1;
  }
  return mass;
}

const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const TAG = /<[^>]+>/g;
const MEDIA = /<(img|svg|video|iframe|canvas|picture)\b/gi;
const TABLE_ROW = /<tr\b/gi;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&(lt|gt|amp|quot|#39|apos);/g, 'x');
}

export function estimateHtmlMass(html: string): number {
  const withoutCode = html.replace(SCRIPT_OR_STYLE, ' ');
  const text = decodeEntities(withoutCode.replace(TAG, ' '));
  const media = withoutCode.match(MEDIA)?.length ?? 0;
  const rows = withoutCode.match(TABLE_ROW)?.length ?? 0;
  return textMass(text) + media * MEDIA_MASS + rows * TABLE_ROW_MASS;
}

export function estimateContentNodesMass(nodes: readonly ContentNode[]): number {
  let mass = 0;
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        mass += textMass(node.value);
        break;
      case 'paper-link':
        mass += textMass(node.label);
        break;
      case 'card':
        mass += CARD_MASS + textMass(node.title) + textMass(node.description);
        break;
      case 'section':
        mass += textMass(node.title ?? '') + estimateContentNodesMass(node.children);
        break;
      case 'list':
        for (const item of node.items) mass += estimateContentNodesMass(item);
        break;
      case 'table':
        mass += node.headers.reduce((sum, h) => sum + textMass(h), 0);
        for (const row of node.rows) {
          mass += TABLE_ROW_MASS + row.reduce((sum, cell) => sum + textMass(cell), 0);
        }
        break;
      case 'paragraph':
      case 'bold':
      case 'callout':
        mass += estimateContentNodesMass(node.children);
        break;
    }
  }
  return mass;
}

export function estimateContentMass(content: PaperContent): number {
  if (typeof content === 'string') return estimateHtmlMass(content);
  if (Array.isArray(content) && content.every(isContentNode)) return estimateContentNodesMass(content);
  if (content === null || content === undefined || typeof content === 'boolean') return 0;
  return REACT_CONTENT_MASS;
}

/** A structured content node (as opposed to a React element, which also has a `type`). */
export function isContentNode(value: unknown): value is ContentNode {
  return typeof value === 'object' && value !== null && 'type' in value && typeof (value as { type: unknown }).type === 'string'
    && !('$$typeof' in value);
}

const factorCache = new WeakMap<Paper, number>();

/**
 * How much of the base content demand a paper's own content claims: grows with the square root
 * of its mass and stays within [0.6, 2.2], so short notes stay compact and long articles get
 * more room without starving their siblings. Always 1 when `layout.contentDemand` is 'uniform'.
 */
export function getContentDemandFactor(paper: Paper, config: PaperCanvasConfig): number {
  if (config.layout.contentDemand === 'uniform') return 1;
  const cached = factorCache.get(paper);
  if (cached !== undefined) return cached;
  const mass = estimateContentMass(paper.content);
  const factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, Math.sqrt(mass / REFERENCE_CONTENT_MASS)));
  factorCache.set(paper, factor);
  return factor;
}
