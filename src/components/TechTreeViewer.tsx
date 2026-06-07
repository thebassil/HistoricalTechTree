'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect, memo } from 'react';
import { UserButton } from '@clerk/nextjs';
import type { InventionNode, InventionLink, PositionedNode } from '@/lib/types/tech-tree';

// ─── Year-to-X Positioning ────────────────────────────────────────────────────

const BREAKPOINTS: [number, number][] = [
  [-3300000, 0],
  [-100000, 3000],
  [-10000, 6000],
  [-3000, 9000],
  [-1000, 12000],
  [-500, 15000],
  [0, 18000],
  [500, 22000],
  [1000, 26000],
  [1400, 30000],
  [1600, 34000],
  [1700, 38000],
  [1800, 44000],
  [1850, 50000],
  [1900, 58000],
  [1950, 68000],
  [2000, 80000],
  [2025, 86000],
];

const CANVAS_MAX_X = BREAKPOINTS[BREAKPOINTS.length - 1][1] + 2000;

function yearToX(year: number): number {
  for (let i = 0; i < BREAKPOINTS.length - 1; i++) {
    const [y0, x0] = BREAKPOINTS[i];
    const [y1, x1] = BREAKPOINTS[i + 1];
    if (year >= y0 && year <= y1) {
      return x0 + ((year - y0) / (y1 - y0)) * (x1 - x0);
    }
  }
  if (year < BREAKPOINTS[0][0]) return BREAKPOINTS[0][1];
  return BREAKPOINTS[BREAKPOINTS.length - 1][1];
}

function xToYear(x: number): number {
  for (let i = 0; i < BREAKPOINTS.length - 1; i++) {
    const [y0, x0] = BREAKPOINTS[i];
    const [y1, x1] = BREAKPOINTS[i + 1];
    if (x >= x0 && x <= x1) {
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 2000;
}

// ─── Year Formatting ──────────────────────────────────────────────────────────

function formatYear(year: number): string {
  if (year <= -1000000) return `${Math.abs(Math.round(year / 100000) / 10)}M BCE`;
  if (year <= -10000) return `${Math.abs(Math.round(year / 1000))}K BCE`;
  if (year < 0) return `${Math.abs(year)} BCE`;
  if (year === 0) return '1 BCE';
  if (year < 1000) return `${year} CE`;
  return `${year}`;
}

// ─── Lane Packing ─────────────────────────────────────────────────────────────

const NODE_WIDTH = 160;
const NODE_HEIGHT = 180;
const LANE_HEIGHT = 210;
const X_PADDING = 40;

// Returns a Map<id, {x, y}> — no spreading of node objects
function computePositionMap(nodes: InventionNode[]): Map<string, { x: number; y: number }> {
  const sorted = [...nodes].sort((a, b) => a.year - b.year);
  const lanes: number[] = [];
  const positions = new Map<string, { x: number; y: number }>();

  for (const node of sorted) {
    const x = yearToX(node.year);
    let laneIndex = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (x - NODE_WIDTH / 2 > lanes[i] + X_PADDING) {
        laneIndex = i;
        break;
      }
    }
    if (laneIndex === -1) {
      laneIndex = lanes.length;
      lanes.push(0);
    }
    lanes[laneIndex] = x + NODE_WIDTH / 2;
    positions.set(node.id, { x, y: 120 + laneIndex * LANE_HEIGHT });
  }
  return positions;
}

// ─── Field colors ─────────────────────────────────────────────────────────────

const FIELD_COLORS: Record<string, string> = {
  Computing: '#2563eb', Engineering: '#dc2626', Physics: '#7c3aed',
  Chemistry: '#ea580c', Biology: '#16a34a', Mathematics: '#0891b2',
  Medicine: '#e11d48', Manufacturing: '#0d9488', Communication: '#6366f1',
  Transportation: '#9333ea', Energy: '#f59e0b', Agriculture: '#65a30d',
  Optics: '#06b6d4', Electronics: '#3b82f6', Construction: '#92400e',
  Food: '#84cc16', Textiles: '#d946ef', Mining: '#78716c',
  Measurement: '#8b5cf6', Music: '#ec4899', Astronomy: '#1e40af',
  Metallurgy: '#a16207', Hydraulics: '#0369a1', Weaponry: '#64748b',
  Safety: '#059669', Sailing: '#0284c7', Space: '#1d4ed8',
  Sanitation: '#15803d', Security: '#475569', Timekeeping: '#7c2d12',
  Recreation: '#d946ef', Diving: '#0891b2', Flying: '#4338ca',
  Electricity: '#2563eb', Lighting: '#f59e0b', Meteorology: '#0369a1',
  Geography: '#65a30d', Commerce: '#b45309', Misc: '#6b7280',
  'Visual media': '#6d28d9',
};
function getFieldColor(field: string): string {
  return FIELD_COLORS[field] || '#6b7280';
}

// ─── Timeline ticks ───────────────────────────────────────────────────────────

const TIMELINE_TICKS = [
  -3300000, -1000000, -100000, -10000, -3000, -1000, -500, 0,
  500, 1000, 1400, 1600, 1700, 1800, 1850, 1900, 1950, 2000, 2025,
];
const MINI_TICKS = [
  -100000, -10000, -1000, 0, 500, 1000, 1500, 1750, 1800, 1900, 1950, 2000,
];

// ─── View state type (stored in ref, not React state) ─────────────────────────

interface ViewState {
  panX: number;
  panY: number;
  zoom: number;
}

// ─── CSS containment style for node cards ─────────────────────────────────────

const NODE_CARD_CONTAINMENT: React.CSSProperties = {
  contain: 'layout style paint',
  contentVisibility: 'auto',
};

// ─── Memoized Node Card ───────────────────────────────────────────────────────

const NodeCard = memo(function NodeCard({
  node,
  pos,
  onSelect,
}: {
  node: InventionNode;
  pos: { x: number; y: number };
  onSelect: (nodeId: string) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div
      className="absolute"
      style={{
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%,0)',
        width: NODE_WIDTH,
        ...NODE_CARD_CONTAINMENT,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => onSelect(node.id)}
    >
      <div className="bg-white border border-gray-900 cursor-pointer hover:shadow-lg hover:shadow-gray-400/30 transition-shadow duration-100">
        <div className="w-full h-[80px] border-b border-gray-900 overflow-hidden bg-gray-200">
          {!imgFailed ? (
            <img
              src={node.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
              style={{ objectPosition: node.imagePosition || 'center' }}
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-300 to-gray-400">
              <span className="text-gray-500 text-xs font-mono">{node.fields[0]?.[0] || '?'}</span>
            </div>
          )}
        </div>
        <div className="px-2 py-1.5">
          <div className="text-[10px] font-bold uppercase leading-tight text-gray-900 line-clamp-2">{node.title}</div>
          {node.subtitle && <div className="text-[9px] text-gray-500 leading-tight mt-0.5 line-clamp-1">{node.subtitle}</div>}
        </div>
        <div className="px-2 pb-1">
          <span className="inline-block text-[9px] font-mono border border-gray-400 px-1 py-0.5 text-gray-700">{formatYear(node.year)}</span>
        </div>
        <div className="px-2 pb-2 flex flex-wrap gap-0.5">
          {node.fields.slice(0, 2).map(f => (
            <span key={f} className="text-[8px] uppercase font-semibold px-1 py-0.5 rounded-sm text-white" style={{ backgroundColor: getFieldColor(f) }}>{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
});

// ─── BFS Utility for Dependency Focus ─────────────────────────────────────────

function bfsSubgraph(
  startId: string,
  linksBySource: Map<string, string[]>,
  linksByTarget: Map<string, string[]>,
): { nodeIds: Set<string>; upstreamIds: Set<string>; downstreamIds: Set<string> } {
  const upstreamIds = new Set<string>();
  const downstreamIds = new Set<string>();

  // BFS upstream (prerequisites): traverse linksByTarget
  const upQueue: string[] = [startId];
  upstreamIds.add(startId);
  while (upQueue.length > 0) {
    const current = upQueue.shift()!;
    const sources = linksByTarget.get(current);
    if (sources) {
      for (const s of sources) {
        if (!upstreamIds.has(s)) {
          upstreamIds.add(s);
          upQueue.push(s);
        }
      }
    }
  }

  // BFS downstream (dependents): traverse linksBySource
  const downQueue: string[] = [startId];
  downstreamIds.add(startId);
  while (downQueue.length > 0) {
    const current = downQueue.shift()!;
    const targets = linksBySource.get(current);
    if (targets) {
      for (const t of targets) {
        if (!downstreamIds.has(t)) {
          downstreamIds.add(t);
          downQueue.push(t);
        }
      }
    }
  }

  const nodeIds = new Set<string>();
  for (const id of upstreamIds) nodeIds.add(id);
  for (const id of downstreamIds) nodeIds.add(id);

  return { nodeIds, upstreamIds, downstreamIds };
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props { nodes: InventionNode[]; links: InventionLink[] }

export default function TechTreeViewer({ nodes, links }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ── Ref-based view (never triggers re-render) ──
  const viewRef = useRef<ViewState>({ panX: -17000, panY: -200, zoom: 0.5 });

  // ── Settled view (React state, triggers virtualization — throttled) ──
  const [settled, setSettled] = useState<ViewState>({ panX: -17000, panY: -200, zoom: 0.5 });
  const lastSettleTimeRef = useRef<number>(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const THROTTLE_MS = 150;

  const scheduleSettle = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastSettleTimeRef.current;

    if (elapsed >= THROTTLE_MS) {
      // Enough time has passed — settle immediately
      lastSettleTimeRef.current = now;
      setSettled({ ...viewRef.current });
      // Clear any pending trailing settle
      if (settleTimer.current) {
        clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }
    } else {
      // Schedule a trailing settle so we always get a final update on stop
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        lastSettleTimeRef.current = Date.now();
        setSettled({ ...viewRef.current });
        settleTimer.current = null;
      }, THROTTLE_MS - elapsed);
    }
  }, []);

  // Apply transform directly to DOM (no React render)
  const applyTransform = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const { panX, panY, zoom } = viewRef.current;
    el.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
  }, []);

  // ── UI state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [showFieldDropdown, setShowFieldDropdown] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewportW, setViewportW] = useState(1920);
  const [viewportH, setViewportH] = useState(1080);
  const [zoomDisplay, setZoomDisplay] = useState(50);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  // ── Panning cursor via ref + CSS class ──
  const panningRef = useRef(false);
  const panStartRef = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Viewport size
  useEffect(() => {
    const update = () => { setViewportW(window.innerWidth); setViewportH(window.innerHeight); };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // ── Precomputed data (stable, no view dependency) ──
  // Position map: Map<id, {x, y}> — no spreading of node objects
  const positionMap = useMemo(() => computePositionMap(nodes), [nodes]);

  // Node map by id (raw InventionNode data — no position fields)
  const nodeDataMap = useMemo(() => {
    const m = new Map<string, InventionNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // Pre-build link indexes
  const linksBySource = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of links) {
      let arr = m.get(l.source);
      if (!arr) { arr = []; m.set(l.source, arr); }
      arr.push(l.target);
    }
    return m;
  }, [links]);

  const linksByTarget = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of links) {
      let arr = m.get(l.target);
      if (!arr) { arr = []; m.set(l.target, arr); }
      arr.push(l.source);
    }
    return m;
  }, [links]);

  const allFields = useMemo(() => {
    const s = new Set<string>();
    for (const n of nodes) for (const f of n.fields) s.add(f);
    return Array.from(s).sort();
  }, [nodes]);

  // ── Filtered node IDs (depends on search + field filter, NOT view) ──
  const filteredIds = useMemo(() => {
    let result = nodes;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.subtitle.toLowerCase().includes(q) ||
        String(n.year).includes(q) ||
        n.fields.some(f => f.toLowerCase().includes(q)) ||
        n.inventors.some(i => i.toLowerCase().includes(q)) ||
        n.organizations.some(o => o.toLowerCase().includes(q))
      );
    }
    if (selectedFields.size > 0) {
      result = result.filter(n => n.fields.some(f => selectedFields.has(f)));
    }
    return new Set(result.map(n => n.id));
  }, [nodes, debouncedSearch, selectedFields]);

  // ── Dependency focus BFS ──
  const focusSubgraph = useMemo(() => {
    if (!focusedNodeId) return null;
    return bfsSubgraph(focusedNodeId, linksBySource, linksByTarget);
  }, [focusedNodeId, linksBySource, linksByTarget]);

  // ── Effective filtered IDs (overridden in focus mode) ──
  const effectiveFilteredIds = useMemo(() => {
    if (focusSubgraph) return focusSubgraph.nodeIds;
    return filteredIds;
  }, [focusSubgraph, filteredIds]);

  // ── Full link path string — built once per filter change, NOT per viewport settle ──
  const fullLinkPath = useMemo(() => {
    const parts: string[] = [];
    for (const link of links) {
      if (!effectiveFilteredIds.has(link.source) || !effectiveFilteredIds.has(link.target)) continue;
      const sp = positionMap.get(link.source);
      const tp = positionMap.get(link.target);
      if (!sp || !tp) continue;
      parts.push(`M${sp.x} ${sp.y + NODE_HEIGHT / 2}L${tp.x} ${tp.y + NODE_HEIGHT / 2}`);
    }
    return parts.join('');
  }, [links, effectiveFilteredIds, positionMap]);

  // ── Focus mode: separate upstream/downstream path strings ──
  const focusLinkPaths = useMemo(() => {
    if (!focusSubgraph || !focusedNodeId) return null;
    const { upstreamIds, downstreamIds } = focusSubgraph;
    const upParts: string[] = [];
    const downParts: string[] = [];
    for (const link of links) {
      if (!effectiveFilteredIds.has(link.source) || !effectiveFilteredIds.has(link.target)) continue;
      const sp = positionMap.get(link.source);
      const tp = positionMap.get(link.target);
      if (!sp || !tp) continue;
      const seg = `M${sp.x} ${sp.y + NODE_HEIGHT / 2}L${tp.x} ${tp.y + NODE_HEIGHT / 2}`;
      // A link is "upstream" if both source and target are in the upstream set
      // (i.e., they are prerequisites of the focused node)
      const isUpstream = upstreamIds.has(link.source) && upstreamIds.has(link.target);
      // A link is "downstream" if both source and target are in the downstream set
      const isDownstream = downstreamIds.has(link.source) && downstreamIds.has(link.target);
      if (isUpstream && !isDownstream) {
        upParts.push(seg);
      } else if (isDownstream && !isUpstream) {
        downParts.push(seg);
      } else {
        // Both directions (e.g. focus node itself connects both ways) — put in upstream
        upParts.push(seg);
      }
    }
    return { upstreamPath: upParts.join(''), downstreamPath: downParts.join('') };
  }, [focusSubgraph, focusedNodeId, links, effectiveFilteredIds, positionMap]);

  // ── Visible nodes (depends on settled view) — viewport-filtered ──
  const visibleNodes = useMemo(() => {
    const pad = 800;
    const { panX, panY, zoom } = settled;
    const vL = (-panX - pad) / zoom;
    const vR = (-panX + viewportW + pad) / zoom;
    const vT = (-panY - pad) / zoom;
    const vB = (-panY + viewportH + pad) / zoom;
    const result: { node: InventionNode; pos: { x: number; y: number } }[] = [];
    for (const id of effectiveFilteredIds) {
      const pos = positionMap.get(id);
      if (!pos) continue;
      if (
        pos.x + NODE_WIDTH / 2 >= vL && pos.x - NODE_WIDTH / 2 <= vR &&
        pos.y + NODE_HEIGHT >= vT && pos.y <= vB
      ) {
        const node = nodeDataMap.get(id);
        if (node) result.push({ node, pos });
      }
    }
    return result;
  }, [effectiveFilteredIds, positionMap, nodeDataMap, settled, viewportW, viewportH]);

  // ── Timeline labels ──
  const timelineLabels = useMemo(() => {
    const { panX, zoom } = settled;
    const labels: { year: number; sx: number }[] = [];
    for (const yr of TIMELINE_TICKS) {
      const sx = yearToX(yr) * zoom + panX;
      if (sx > -100 && sx < viewportW + 100) labels.push({ year: yr, sx });
    }
    return labels;
  }, [settled, viewportW]);

  // Center year for mini-timeline indicator
  const centerYear = useMemo(() => {
    const cx = (-settled.panX + viewportW / 2) / settled.zoom;
    return xToYear(cx);
  }, [settled, viewportW]);

  // ── Helper: build a PositionedNode from id (for modal/navigation) ──
  const getPositionedNode = useCallback((id: string): PositionedNode | null => {
    const node = nodeDataMap.get(id);
    const pos = positionMap.get(id);
    if (!node || !pos) return null;
    return { ...node, ...pos };
  }, [nodeDataMap, positionMap]);

  // Selected node for the modal
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return getPositionedNode(selectedNodeId);
  }, [selectedNodeId, getPositionedNode]);

  // ── Node selection handler (stable callback) ──
  const handleNodeSelect = useCallback((nodeId: string) => {
    if (focusedNodeId) {
      // In focus mode, clicking a node switches focus to that node
      setFocusedNodeId(nodeId);
    }
    setSelectedNodeId(nodeId);
  }, [focusedNodeId]);

  // ── Pan handlers (ref-based, no React state during drag) ──
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.ui-overlay, .modal-overlay')) return;
    panningRef.current = true;
    // Toggle CSS class directly on container
    containerRef.current?.classList.add('is-panning');
    panStartRef.current = {
      mx: e.clientX, my: e.clientY,
      px: viewRef.current.panX, py: viewRef.current.panY,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!panningRef.current) return;
    viewRef.current.panX = panStartRef.current.px + (e.clientX - panStartRef.current.mx);
    viewRef.current.panY = panStartRef.current.py + (e.clientY - panStartRef.current.my);
    applyTransform();
    scheduleSettle();
  }, [applyTransform, scheduleSettle]);

  const onPointerUp = useCallback(() => {
    if (!panningRef.current) return;
    panningRef.current = false;
    containerRef.current?.classList.remove('is-panning');
    setSettled({ ...viewRef.current });
  }, []);

  // ── Wheel zoom (native listener for passive:false) ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const v = viewRef.current;
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const newZoom = Math.max(0.05, Math.min(4, v.zoom * factor));
      const wx = (mx - v.panX) / v.zoom;
      const wy = (my - v.panY) / v.zoom;
      v.panX = mx - wx * newZoom;
      v.panY = my - wy * newZoom;
      v.zoom = newZoom;
      applyTransform();
      setZoomDisplay(Math.round(newZoom * 100));
      scheduleSettle();
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [applyTransform, scheduleSettle]);

  // Initial transform
  useEffect(() => { applyTransform(); }, [applyTransform]);

  // ── Zoom buttons ──
  const zoomBy = useCallback((factor: number) => {
    const v = viewRef.current;
    const newZoom = Math.max(0.05, Math.min(4, v.zoom * factor));
    const cx = viewportW / 2, cy = viewportH / 2;
    const wx = (cx - v.panX) / v.zoom;
    const wy = (cy - v.panY) / v.zoom;
    v.panX = cx - wx * newZoom;
    v.panY = cy - wy * newZoom;
    v.zoom = newZoom;
    applyTransform();
    setZoomDisplay(Math.round(newZoom * 100));
    setSettled({ ...v });
  }, [viewportW, viewportH, applyTransform]);

  // ── Mini-timeline jump ──
  const jumpToYear = useCallback((year: number) => {
    const v = viewRef.current;
    v.panX = -yearToX(year) * v.zoom + viewportW / 2;
    v.panY = -200;
    applyTransform();
    setSettled({ ...v });
  }, [viewportW, applyTransform]);

  // ── Navigate to node ──
  const navigateToNode = useCallback((id: string) => {
    const pos = positionMap.get(id);
    if (!pos) return;
    const v = viewRef.current;
    v.panX = -pos.x * v.zoom + viewportW / 2;
    v.panY = -pos.y * v.zoom + viewportH / 2;
    applyTransform();
    setSettled({ ...v });
    setSelectedNodeId(id);
    setSearchQuery('');
  }, [viewportW, viewportH, applyTransform, positionMap]);

  // ── Field toggle ──
  const toggleField = useCallback((field: string) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (next.has(field)) { next.delete(field); } else { next.add(field); }
      return next;
    });
  }, []);

  // ── Search results ──
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return nodes
      .filter(n => n.title.toLowerCase().includes(q) || n.subtitle.toLowerCase().includes(q) ||
        String(n.year).includes(q) || n.inventors.some(i => i.toLowerCase().includes(q)) ||
        n.organizations.some(o => o.toLowerCase().includes(q)))
      .slice(0, 15);
  }, [nodes, searchQuery]);

  // ── Connections for detail modal ──
  const getConnections = useCallback((id: string) => {
    const prereqs = (linksByTarget.get(id) || []).map(s => getPositionedNode(s)).filter(Boolean) as PositionedNode[];
    const deps = (linksBySource.get(id) || []).map(t => getPositionedNode(t)).filter(Boolean) as PositionedNode[];
    return { prereqs, deps };
  }, [linksBySource, linksByTarget, getPositionedNode]);

  // ── Focus mode handlers ──
  const enterFocusMode = useCallback((nodeId: string) => {
    setFocusedNodeId(nodeId);
    setSelectedNodeId(null);
  }, []);

  const exitFocusMode = useCallback(() => {
    setFocusedNodeId(null);
  }, []);

  // Focused node data for the chip display
  const focusedNode = useMemo(() => {
    if (!focusedNodeId) return null;
    return nodeDataMap.get(focusedNodeId) || null;
  }, [focusedNodeId, nodeDataMap]);

  // ── Render ──
  return (
    <div
      ref={containerRef}
      className="relative w-screen h-screen overflow-hidden bg-[#f5f0e8] select-none"
      style={{ cursor: 'grab', touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Inline style for panning cursor — toggled via CSS class on container */}
      <style>{`.is-panning { cursor: grabbing !important; }`}</style>

      {/* Canvas layer — transformed via ref, not React state */}
      <div
        ref={canvasRef}
        style={{ transformOrigin: '0 0', position: 'absolute', top: 0, left: 0, width: CANVAS_MAX_X, height: 100000, willChange: 'transform' }}
      >
        {/* SVG connections — full path rendered at once, no viewport filtering */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
          {focusLinkPaths ? (
            <>
              <path d={focusLinkPaths.upstreamPath} stroke="#3b82f6" strokeWidth={2} fill="none" opacity={0.6} />
              <path d={focusLinkPaths.downstreamPath} stroke="#22c55e" strokeWidth={2} fill="none" opacity={0.6} />
            </>
          ) : (
            <path d={fullLinkPath} stroke="#94a3b8" strokeWidth={1.5} fill="none" opacity={0.4} />
          )}
        </svg>

        {/* Intro text */}
        <div style={{ position: 'absolute', left: 17500, top: -300, width: 800, pointerEvents: 'none' }}>
          <h1 className="text-6xl font-bold text-gray-800 tracking-tight mb-4">EMERGING TECH TREE</h1>
          <p className="text-xl text-gray-600 leading-relaxed max-w-lg">
            {nodes.length} technologies and their connections, from prehistoric tools to modern AI.
          </p>
        </div>

        {/* Node cards — memoized, viewport-filtered */}
        {visibleNodes.map(({ node, pos }) => (
          <NodeCard key={node.id} node={node} pos={pos} onSelect={handleNodeSelect} />
        ))}
      </div>

      {/* ── Timeline header ── */}
      <div className="ui-overlay absolute top-0 left-0 right-0 h-10 bg-[#f5f0e8]/90 backdrop-blur-sm border-b border-gray-300 flex items-end pointer-events-none z-20">
        {timelineLabels.map(({ year, sx }) => (
          <div key={year} className="absolute bottom-1" style={{ left: sx }}>
            <span className="text-xs font-mono text-gray-500 whitespace-nowrap">{formatYear(year)}</span>
          </div>
        ))}
      </div>

      {/* ── User button ── */}
      <div className="ui-overlay absolute top-3 left-3 z-30"><UserButton /></div>

      {/* ── Focus mode chip ── */}
      {focusedNode && focusSubgraph && (
        <div className="ui-overlay absolute top-14 left-1/2 -translate-x-1/2 z-30">
          <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-full shadow-lg px-4 py-2">
            <span className="text-sm text-gray-700">
              <span className="font-semibold">Focused on:</span> {focusedNode.title}
              <span className="text-gray-400 ml-1">— {focusSubgraph.nodeIds.size} nodes</span>
            </span>
            <button
              onClick={exitFocusMode}
              className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs font-bold leading-none"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* ── Search ── */}
      <div className="ui-overlay absolute top-3 right-3 z-30 w-72">
        <div className="relative">
          <input
            type="text"
            placeholder="Search techs/years/people"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 pl-9 text-sm border border-gray-400 rounded bg-white/95 backdrop-blur-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <svg className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        {searchResults.length > 0 && (
          <div className="mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-80 overflow-y-auto">
            {searchResults.map(n => (
              <button key={n.id} className="w-full text-left px-3 py-2 hover:bg-gray-100 border-b border-gray-100 last:border-0" onClick={() => navigateToNode(n.id)}>
                <div className="text-sm font-semibold text-gray-800">{n.title}</div>
                <div className="text-xs text-gray-500">{formatYear(n.year)} · {n.fields.join(', ')}</div>
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 relative">
          <button
            onClick={() => setShowFieldDropdown(p => !p)}
            className="w-full px-3 py-2 text-sm border border-gray-400 rounded bg-white/95 backdrop-blur-sm text-gray-700 text-left hover:bg-gray-50"
          >
            {selectedFields.size > 0 ? `Filtering: ${selectedFields.size} field${selectedFields.size > 1 ? 's' : ''}` : 'Filter by field'}
            <svg className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showFieldDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-64 overflow-y-auto z-50">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-3 py-1.5">
                <input
                  type="text"
                  placeholder="Search fields..."
                  value={fieldSearch}
                  onChange={e => setFieldSearch(e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  onPointerDown={e => e.stopPropagation()}
                />
              </div>
              {selectedFields.size > 0 && (
                <button onClick={() => setSelectedFields(new Set())} className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 border-b border-gray-200 font-medium">Clear all</button>
              )}
              {allFields
                .filter(f => !fieldSearch.trim() || f.toLowerCase().includes(fieldSearch.toLowerCase()))
                .map(f => (
                <button key={f} className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2" onClick={() => toggleField(f)}>
                  <span className="w-3 h-3 rounded-sm border flex-shrink-0" style={{ backgroundColor: selectedFields.has(f) ? getFieldColor(f) : 'transparent', borderColor: getFieldColor(f) }} />
                  <span className="text-xs text-gray-700">{f}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Mini timeline ── */}
      <div className="ui-overlay absolute bottom-4 left-16 right-16 z-20">
        <div className="relative h-8 bg-white/80 backdrop-blur-sm border border-gray-300 rounded-full px-4 flex items-center">
          <div className="absolute left-4 right-4 h-0.5 bg-gray-300 top-1/2 -translate-y-1/2" />
          {MINI_TICKS.map(yr => {
            const pct = (yearToX(yr) / CANVAS_MAX_X) * 100;
            return (
              <button key={yr} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group" style={{ left: `calc(${pct}% * 0.92 + 4%)` }} onClick={() => jumpToYear(yr)} title={formatYear(yr)}>
                <div className="w-1 h-3 bg-gray-400 group-hover:bg-blue-500 transition-colors" />
                <span className="absolute top-4 left-1/2 -translate-x-1/2 text-[8px] text-gray-500 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">{formatYear(yr)}</span>
              </button>
            );
          })}
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow" style={{ left: `calc(${(yearToX(centerYear) / CANVAS_MAX_X) * 100}% * 0.92 + 4%)` }} />
        </div>
      </div>

      {/* ── Zoom controls ── */}
      <div className="ui-overlay absolute bottom-16 right-4 z-30 flex flex-col items-center gap-1">
        <button onClick={() => zoomBy(1.4)} className="w-8 h-8 bg-white border border-gray-300 rounded flex items-center justify-center text-gray-700 hover:bg-gray-50 text-lg font-bold">+</button>
        <span className="text-xs font-mono text-gray-600 bg-white/90 px-1.5 py-0.5 rounded border border-gray-200">{zoomDisplay}%</span>
        <button onClick={() => zoomBy(1 / 1.4)} className="w-8 h-8 bg-white border border-gray-300 rounded flex items-center justify-center text-gray-700 hover:bg-gray-50 text-lg font-bold">&minus;</button>
      </div>

      {/* ── Node count ── */}
      <div className="ui-overlay absolute bottom-4 left-4 z-20">
        <span className="text-xs font-mono text-gray-500 bg-white/80 px-2 py-1 rounded border border-gray-200">
          {visibleNodes.length} / {focusSubgraph ? focusSubgraph.nodeIds.size : effectiveFilteredIds.size} nodes
        </span>
      </div>

      {/* ── Detail modal ── */}
      {selectedNode && (() => {
        const { prereqs, deps } = getConnections(selectedNode.id);
        return (
          <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedNodeId(null)}>
            <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="relative h-48 bg-gray-200 overflow-hidden rounded-t-lg">
                <img src={selectedNode.image} alt="" className="w-full h-full object-cover" style={{ objectPosition: selectedNode.imagePosition || 'center' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <button onClick={() => setSelectedNodeId(null)} className="absolute top-3 right-3 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center text-gray-700 hover:bg-white shadow">&times;</button>
              </div>
              <div className="p-5">
                <h2 className="text-xl font-bold text-gray-900 uppercase">{selectedNode.title}</h2>
                {selectedNode.subtitle && <p className="text-sm text-gray-500 mt-0.5">{selectedNode.subtitle}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-sm font-mono border border-gray-400 px-2 py-0.5 text-gray-700">{formatYear(selectedNode.year)}</span>
                  {selectedNode.type && <span className="text-sm border border-gray-300 px-2 py-0.5 text-gray-600 rounded">{selectedNode.type}</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {selectedNode.fields.map(f => <span key={f} className="text-xs uppercase font-semibold px-2 py-0.5 rounded text-white" style={{ backgroundColor: getFieldColor(f) }}>{f}</span>)}
                  {selectedNode.subfields.map(sf => <span key={sf} className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">{sf}</span>)}
                </div>
                {selectedNode.details && <p className="mt-3 text-sm text-gray-700 leading-relaxed">{selectedNode.details}</p>}
                {selectedNode.dateDetails && <p className="mt-2 text-xs text-gray-500 italic">{selectedNode.dateDetails}</p>}
                <div className="mt-4 space-y-1.5 text-sm text-gray-600">
                  {selectedNode.inventors.length > 0 && <div><span className="font-medium text-gray-800">Inventors:</span> {selectedNode.inventors.join(', ')}</div>}
                  {selectedNode.organizations.length > 0 && <div><span className="font-medium text-gray-800">Organizations:</span> {selectedNode.organizations.join(', ')}</div>}
                  {selectedNode.formattedLocation && <div><span className="font-medium text-gray-800">Location:</span> {selectedNode.formattedLocation}</div>}
                </div>
                {(prereqs.length > 0 || deps.length > 0) && (
                  <div className="mt-4 border-t border-gray-200 pt-3">
                    {prereqs.length > 0 && (
                      <div className="mb-2">
                        <span className="text-xs font-semibold uppercase text-gray-500">Prerequisites:</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {prereqs.map(p => <button key={p.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-100" onClick={() => setSelectedNodeId(p.id)}>{p.title} ({formatYear(p.year)})</button>)}
                        </div>
                      </div>
                    )}
                    {deps.length > 0 && (
                      <div>
                        <span className="text-xs font-semibold uppercase text-gray-500">Enables:</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {deps.map(d => <button key={d.id} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded hover:bg-green-100" onClick={() => setSelectedNodeId(d.id)}>{d.title} ({formatYear(d.year)})</button>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-3">
                  {selectedNode.wikipedia && (
                    <a href={selectedNode.wikipedia} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 underline">View on Wikipedia &rarr;</a>
                  )}
                  <button
                    onClick={() => enterFocusMode(selectedNode.id)}
                    className="text-sm bg-indigo-50 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-100 border border-indigo-200 font-medium"
                  >
                    Show dependency tree
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
