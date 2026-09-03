// ============================================================================
// Spatial navigation of a claim's critique structure.
//
// WHY THIS EXISTS, since "games render spaces well" is not on its own a
// reason to build one. A Critique is itself a valid CritiqueTargetType,
// so critiques of critiques are real structure in this protocol — a
// threaded disagreement, not a flat list of reactions. The critique
// panel calls get_critiques_for exactly once, on the claim, so it shows
// depth 1 and nothing beyond it. Everything deeper is invisible in the
// list view and structurally cannot be shown there.
//
// So this is not a prettier presentation of what the list already says.
// It is the only view that can show the shape of an argument.
//
// WHY SVG RATHER THAN CANVAS. README.md §9 records that immediate-mode
// canvas rendering was ruled out for this UI: it costs text selection,
// deep linking and screen-reader access, and LumbarRehab being the
// reference domain means some users have impairments that makes a real
// regression rather than a tradeoff. That reasoning rules out a
// RENDERING TECHNOLOGY, not spatial navigation. Games reach for canvas
// because they push thousands of sprites at sixty frames a second; a
// critique graph is tens of nodes and static between interactions. SVG
// gives real DOM elements — focusable, labellable, reachable by keyboard
// and readable by a screen reader — so the objection dissolves rather
// than being traded away.
//
// The graph is also SUPPLEMENTARY. Every node it draws is reachable in
// the ordinary critique list, and the list stays the primary view.
//
// TWO §4.4 CONSTRAINTS SHAPED THE VISUAL DESIGN, and both cut against
// what a game would do:
//
//   - NODE SIZE IS UNIFORM. A game would scale nodes by importance, and
//     that is precisely the canonical comparative signal Invariant #1
//     forbids — a bigger node is a claim about which critique matters
//     more, made by the client, presented as neutral. Size carries no
//     information here, deliberately.
//   - LAYOUT IS DETERMINISTIC, not force-directed. A force simulation
//     seeds randomly, so two viewers would see different shapes for the
//     same argument; §4.4 requires the artifact under evaluation to
//     render the same for everyone. Positions here are a pure function
//     of the tree's own structure and protocol order.
//
// Edge opacity does track conductance, which is the protocol's own
// value, computed identically for every viewer, and shown as a visual
// attribute exactly as the list already shows it — never as an ordering.
// ============================================================================

import type { Critique, CritiqueMode } from './types';

/** A critique and everything critiquing it, recursively. */
export interface CritiqueNode {
  entryHash: Uint8Array;
  actionHash: Uint8Array;
  entry: Critique;
  /** Effective conductance of this critique's own SynapticLink to its
   * parent, or null when unread. Rendered as edge opacity, never size. */
  conductance: number | null;
  children: CritiqueNode[];
}

export interface PlacedNode {
  id: string;
  kind: 'claim' | 'critique';
  label: string;
  mode: CritiqueMode | null;
  content: string;
  depth: number;
  x: number;
  y: number;
}

export interface PlacedEdge {
  fromId: string;
  toId: string;
  x1: number; y1: number; x2: number; y2: number;
  conductance: number | null;
}

export interface Layout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

export const NODE_RADIUS = 9;
const ROW_GAP = 58;
const COL_GAP = 46;
const MARGIN = 16;

/** Layered top-down tree: depth is a row, siblings spread across a row,
 * and a parent sits centred over its children.
 *
 * A RADIAL LAYOUT WAS TRIED FIRST AND REPLACED. It is geometrically
 * correct and visually useless for this data: with two root branches the
 * children land at 0 and pi radians, so the entire argument renders as a
 * flat horizontal line through the centre, and a chain of replies
 * continues along the same spoke. Radial suits many-branch ego networks;
 * a threaded disagreement is a hierarchy, and drawing it as one is what
 * makes the depth legible. The defect was invisible to every assertion
 * and obvious in the first screenshot.
 *
 * Pure and deterministic — same tree in, same coordinates out, for every
 * viewer. No randomness, no simulation, no iteration count that could
 * differ between machines. */
export function layoutTree(
  claimId: string, claimContent: string, roots: CritiqueNode[],
): Layout {
  const nodes: PlacedNode[] = [];
  const edges: PlacedEdge[] = [];

  // Leaves are placed left to right in protocol order; every parent is
  // then centred over the span its own children occupy.
  let nextLeafColumn = 0;
  interface Placed { id: string; x: number; y: number }

  const placeSubtree = (node: CritiqueNode, depth: number): Placed => {
    const id = b64(node.actionHash);
    const y = depth * ROW_GAP;
    const children = node.children.map((child) => placeSubtree(child, depth + 1));

    const x = children.length === 0
      ? (nextLeafColumn++) * COL_GAP
      : (children[0].x + children[children.length - 1].x) / 2;

    nodes.push({
      id, kind: 'critique',
      label: node.entry.critique_mode,
      mode: node.entry.critique_mode,
      content: node.entry.content,
      depth, x, y,
    });
    for (const child of children) {
      edges.push({ fromId: id, toId: child.id, x1: x, y1: y, x2: child.x, y2: child.y, conductance: null });
    }
    return { id, x, y };
  };

  const rootPlacements = roots.map((root) => placeSubtree(root, 1));

  // Conductance belongs to a critique's link to ITS OWN target, so it is
  // attached to the edge arriving at that node rather than leaving it.
  const conductanceById = new Map<string, number | null>();
  const collect = (list: CritiqueNode[]) => {
    for (const node of list) {
      conductanceById.set(b64(node.actionHash), node.conductance);
      collect(node.children);
    }
  };
  collect(roots);
  for (const edge of edges) edge.conductance = conductanceById.get(edge.toId) ?? null;

  const claimX = rootPlacements.length === 0
    ? 0
    : (rootPlacements[0].x + rootPlacements[rootPlacements.length - 1].x) / 2;
  nodes.push({
    id: claimId, kind: 'claim', label: 'Claim', mode: null,
    content: claimContent, depth: 0, x: claimX, y: 0,
  });
  for (const root of rootPlacements) {
    edges.push({
      fromId: claimId, toId: root.id,
      x1: claimX, y1: 0, x2: root.x, y2: root.y,
      conductance: conductanceById.get(root.id) ?? null,
    });
  }

  // Crop to the content rather than to a fixed square. The radial
  // version sized its viewBox by depth and left most of it empty, which
  // is what made a four-node graph read as a line adrift in whitespace.
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs) - NODE_RADIUS - MARGIN;
  const minY = Math.min(...ys) - NODE_RADIUS - MARGIN;
  const width = (Math.max(...xs) + NODE_RADIUS + MARGIN) - minX;
  const height = (Math.max(...ys) + NODE_RADIUS + MARGIN) - minY;

  for (const node of nodes) { node.x -= minX; node.y -= minY; }
  for (const edge of edges) {
    edge.x1 -= minX; edge.y1 -= minY; edge.x2 -= minX; edge.y2 -= minY;
  }

  return { nodes, edges, width, height };
}

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/** Total critiques in a tree, at any depth. */
export function countNodes(roots: CritiqueNode[]): number {
  return roots.reduce((n, node) => n + 1 + countNodes(node.children), 0);
}

/** Greatest depth present, 0 for an unchallenged claim. */
export function maxDepth(roots: CritiqueNode[]): number {
  if (roots.length === 0) return 0;
  return 1 + Math.max(...roots.map((node) => maxDepth(node.children)));
}

/** The tree flattened in reading order: each node followed by whatever
 * critiques it, depth-first.
 *
 * The placed-node array cannot be used for this. Layout builds it in
 * POST-order — children are positioned before their parent, because a
 * parent is centred over the span its children occupy — so reading it
 * directly presents the argument backwards, deepest reply first. That
 * shipped briefly and was caught in a screenshot: the text peer is the
 * primary view for anyone using a screen reader, and it was inverting
 * the thread it exists to make readable. */
export function flattenPreOrder(
  roots: CritiqueNode[], depth = 1,
): Array<{ node: CritiqueNode; depth: number }> {
  const out: Array<{ node: CritiqueNode; depth: number }> = [];
  for (const node of roots) {
    out.push({ node, depth });
    out.push(...flattenPreOrder(node.children, depth + 1));
  }
  return out;
}
