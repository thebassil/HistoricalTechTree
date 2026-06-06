'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
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

function yearToX(year: number): number {
  for (let i = 0; i < BREAKPOINTS.length - 1; i++) {
    const [y0, x0] = BREAKPOINTS[i];
    const [y1, x1] = BREAKPOINTS[i + 1];
    if (year >= y0 && year <= y1) {
      const t = (year - y0) / (y1 - y0);
      return x0 + t * (x1 - x0);
    }
  }
  if (year < BREAKPOINTS[0][0]) return BREAKPOINTS[0][1];
  return BREAKPOINTS[BREAKPOINTS.length - 1][1];
}

// ─── Year Formatting ──────────────────────────────────────────────────────────

function formatYear(year: number): string {
  if (year <= -1000000) {
    return `${Math.abs(Math.round(year / 100000) / 10)}M BCE`;
  }
  if (year <= -10000) {
    return `${Math.abs(Math.round(year / 1000))}K BCE`;
  }
  if (year < 0) {
    return `${Math.abs(year)} BCE`;
  }
  if (year === 0) return '1 BCE';
  if (year < 1000) return `${year} CE`;
  return `${year}`;
}

// ─── Lane Packing for Y positioning ──────────────────────────────────────────

const NODE_WIDTH = 160;
const NODE_HEIGHT = 180;
const LANE_HEIGHT = 210;
const X_PADDING = 40;

function computePositions(nodes: InventionNode[]): PositionedNode[] {
  const sorted = [...nodes].sort((a, b) => a.year - b.year);
  // lanes[i] = rightmost x-extent in lane i
  const lanes: number[] = [];
  const positioned: PositionedNode[] = [];

  for (const node of sorted) {
    const x = yearToX(node.year);
    let laneIndex = 0;
    let placed = false;

    for (let i = 0; i < lanes.length; i++) {
      if (x - NODE_WIDTH / 2 > lanes[i] + X_PADDING) {
        laneIndex = i;
        placed = true;
        break;
      }
    }

    if (!placed) {
      laneIndex = lanes.length;
      lanes.push(0);
    }

    lanes[laneIndex] = x + NODE_WIDTH / 2;
    const y = 120 + laneIndex * LANE_HEIGHT;

    positioned.push({ ...node, x, y });
  }

  return positioned;
}

// ─── Field color mapping ─────────────────────────────────────────────────────

const FIELD_COLORS: Record<string, string> = {
  'Computing': '#2563eb',
  'Engineering': '#dc2626',
  'Physics': '#7c3aed',
  'Chemistry': '#ea580c',
  'Biology': '#16a34a',
  'Mathematics': '#0891b2',
  'Medicine': '#e11d48',
  'Materials': '#ca8a04',
  'Manufacturing': '#0d9488',
  'Communication': '#6366f1',
  'Transportation': '#9333ea',
  'Energy': '#f59e0b',
  'Agriculture': '#65a30d',
  'Military': '#64748b',
  'Optics': '#06b6d4',
  'Electronics': '#3b82f6',
  'Aerospace': '#1d4ed8',
  'Construction': '#92400e',
  'Food': '#84cc16',
  'Textiles': '#d946ef',
  'Mining': '#78716c',
  'Navigation': '#0284c7',
  'Measurement': '#8b5cf6',
  'Music': '#ec4899',
  'Writing': '#4f46e5',
  'Astronomy': '#1e40af',
  'Architecture': '#b45309',
  'Metallurgy': '#a16207',
  'Hydraulics': '#0369a1',
  'Mechanical': '#b91c1c',
  'Electrical': '#2563eb',
  'Nuclear': '#7c2d12',
  'Genetics': '#15803d',
  'Robotics': '#4338ca',
  'Nanotechnology': '#6d28d9',
  'Biotechnology': '#059669',
  'Telecommunications': '#7c3aed',
  'Information': '#2563eb',
  'Cryptography': '#475569',
};

function getFieldColor(field: string): string {
  return FIELD_COLORS[field] || '#6b7280';
}

// ─── Timeline ticks ──────────────────────────────────────────────────────────

const TIMELINE_TICKS = [
  -3300000, -1000000, -100000, -10000, -3000, -1000, -500, 0,
  500, 1000, 1400, 1600, 1700, 1800, 1850, 1900, 1950, 2000, 2025
];

const MINI_TIMELINE_TICKS = [
  -100000, -10000, -1000, 0, 500, 1000, 1500, 1750, 1800, 1900, 1950, 2000
];

// ─── Main Component ──────────────────────────────────────────────────────────

interface TechTreeViewerProps {
  nodes: InventionNode[];
  links: InventionLink[];
}

export default function TechTreeViewer({ nodes, links }: TechTreeViewerProps) {
  // Canvas state
  const [panX, setPanX] = useState(-17000);
  const [panY, setPanY] = useState(-200);
  const [zoom, setZoom] = useState(0.5);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [showFieldDropdown, setShowFieldDropdown] = useState(false);
  const [selectedNode, setSelectedNode] = useState<PositionedNode | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // Compute all positions once
  const positionedNodes = useMemo(() => computePositions(nodes), [nodes]);

  // Build lookup map
  const nodeMap = useMemo(() => {
    const map = new Map<string, PositionedNode>();
    for (const node of positionedNodes) {
      map.set(node.id, node);
    }
    return map;
  }, [positionedNodes]);

  // Get all unique fields
  const allFields = useMemo(() => {
    const fieldSet = new Set<string>();
    for (const node of nodes) {
      for (const field of node.fields) {
        fieldSet.add(field);
      }
    }
    return Array.from(fieldSet).sort();
  }, [nodes]);

  // Filter nodes
  const filteredNodes = useMemo(() => {
    let result = positionedNodes;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(node =>
        node.title.toLowerCase().includes(q) ||
        node.subtitle.toLowerCase().includes(q) ||
        String(node.year).includes(q) ||
        node.fields.some(f => f.toLowerCase().includes(q)) ||
        node.inventors.some(i => i.toLowerCase().includes(q)) ||
        node.organizations.some(o => o.toLowerCase().includes(q))
      );
    }

    if (selectedFields.size > 0) {
      result = result.filter(node =>
        node.fields.some(f => selectedFields.has(f))
      );
    }

    return result;
  }, [positionedNodes, searchQuery, selectedFields]);

  // Build set of visible node IDs for link filtering
  const filteredNodeIds = useMemo(() => {
    return new Set(filteredNodes.map(n => n.id));
  }, [filteredNodes]);

  // Viewport dimensions
  const [viewportWidth, setViewportWidth] = useState(1920);
  const [viewportHeight, setViewportHeight] = useState(1080);

  useEffect(() => {
    const updateSize = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Virtualization: only render nodes in viewport
  const visibleNodes = useMemo(() => {
    const padding = 400; // pixels of padding around viewport
    const vLeft = (-panX - padding) / zoom;
    const vRight = (-panX + viewportWidth + padding) / zoom;
    const vTop = (-panY - padding) / zoom;
    const vBottom = (-panY + viewportHeight + padding) / zoom;

    return filteredNodes.filter(node =>
      node.x + NODE_WIDTH / 2 >= vLeft &&
      node.x - NODE_WIDTH / 2 <= vRight &&
      node.y + NODE_HEIGHT >= vTop &&
      node.y <= vBottom
    );
  }, [filteredNodes, panX, panY, zoom, viewportWidth, viewportHeight]);

  // Visible links: both endpoints must be visible or in viewport
  const visibleLinks = useMemo(() => {
    const visibleIds = new Set(visibleNodes.map(n => n.id));
    return links.filter(link =>
      filteredNodeIds.has(link.source) &&
      filteredNodeIds.has(link.target) &&
      (visibleIds.has(link.source) || visibleIds.has(link.target))
    );
  }, [links, visibleNodes, filteredNodeIds]);

  // Canvas size for timeline
  const canvasWidth = useMemo(() => BREAKPOINTS[BREAKPOINTS.length - 1][1] + 2000, []);

  // ─── Pan & Zoom handlers ──────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && (
      e.target.closest('.node-card') ||
      e.target.closest('.ui-overlay') ||
      e.target.closest('.modal-overlay')
    )) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX, panY };
  }, [panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPanX(panStart.current.panX + dx);
    setPanY(panStart.current.panY + dy);
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.05, Math.min(4, zoom * delta));

    // Zoom toward mouse position
    const worldX = (mouseX - panX) / zoom;
    const worldY = (mouseY - panY) / zoom;
    const newPanX = mouseX - worldX * newZoom;
    const newPanY = mouseY - worldY * newZoom;

    setZoom(newZoom);
    setPanX(newPanX);
    setPanY(newPanY);
  }, [zoom, panX, panY]);

  // ─── Mini-timeline navigation ─────────────────────────────────────────────

  const handleMiniTimelineClick = useCallback((year: number) => {
    const targetX = yearToX(year);
    setPanX(-targetX * zoom + viewportWidth / 2);
    setPanY(-200);
  }, [zoom, viewportWidth]);

  // Current viewport center year (for mini-timeline indicator)
  const viewportCenterYear = useMemo(() => {
    const centerWorldX = (-panX + viewportWidth / 2) / zoom;
    // Inverse of yearToX - find which year corresponds to this x
    for (let i = 0; i < BREAKPOINTS.length - 1; i++) {
      const [y0, x0] = BREAKPOINTS[i];
      const [y1, x1] = BREAKPOINTS[i + 1];
      if (centerWorldX >= x0 && centerWorldX <= x1) {
        const t = (centerWorldX - x0) / (x1 - x0);
        return y0 + t * (y1 - y0);
      }
    }
    return 2000;
  }, [panX, zoom, viewportWidth]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    const newZoom = Math.min(4, zoom * 1.3);
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;
    const worldX = (centerX - panX) / zoom;
    const worldY = (centerY - panY) / zoom;
    setPanX(centerX - worldX * newZoom);
    setPanY(centerY - worldY * newZoom);
    setZoom(newZoom);
  }, [zoom, panX, panY, viewportWidth, viewportHeight]);

  const zoomOut = useCallback(() => {
    const newZoom = Math.max(0.05, zoom / 1.3);
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;
    const worldX = (centerX - panX) / zoom;
    const worldY = (centerY - panY) / zoom;
    setPanX(centerX - worldX * newZoom);
    setPanY(centerY - worldY * newZoom);
    setZoom(newZoom);
  }, [zoom, panX, panY, viewportWidth, viewportHeight]);

  // Toggle field filter
  const toggleField = useCallback((field: string) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  }, []);

  // Image error handler
  const handleImageError = useCallback((nodeId: string) => {
    setFailedImages(prev => new Set(prev).add(nodeId));
  }, []);

  // Navigate to a node (from search result click)
  const navigateToNode = useCallback((node: PositionedNode) => {
    setPanX(-node.x * zoom + viewportWidth / 2);
    setPanY(-node.y * zoom + viewportHeight / 2);
    setSelectedNode(node);
    setSearchQuery('');
  }, [zoom, viewportWidth, viewportHeight]);

  // Search results (limited)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return positionedNodes
      .filter(node =>
        node.title.toLowerCase().includes(q) ||
        node.subtitle.toLowerCase().includes(q) ||
        String(node.year).includes(q) ||
        node.inventors.some(i => i.toLowerCase().includes(q)) ||
        node.organizations.some(o => o.toLowerCase().includes(q))
      )
      .slice(0, 20);
  }, [positionedNodes, searchQuery]);

  // Get connected nodes for detail modal
  const getConnections = useCallback((nodeId: string) => {
    const prerequisites: PositionedNode[] = [];
    const dependents: PositionedNode[] = [];
    for (const link of links) {
      if (link.target === nodeId) {
        const source = nodeMap.get(link.source);
        if (source) prerequisites.push(source);
      }
      if (link.source === nodeId) {
        const target = nodeMap.get(link.target);
        if (target) dependents.push(target);
      }
    }
    return { prerequisites, dependents };
  }, [links, nodeMap]);

  // Timeline header labels based on viewport
  const timelineLabels = useMemo(() => {
    const labels: { year: number; screenX: number }[] = [];
    for (const year of TIMELINE_TICKS) {
      const worldX = yearToX(year);
      const screenX = worldX * zoom + panX;
      if (screenX > -100 && screenX < viewportWidth + 100) {
        labels.push({ year, screenX });
      }
    }
    return labels;
  }, [zoom, panX, viewportWidth]);

  return (
    <div
      ref={containerRef}
      className="relative w-screen h-screen overflow-hidden bg-[#f5f0e8] select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
    >
      {/* ─── Canvas Transform Layer ─────────────────────────────────────── */}
      <div
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: '0 0',
          position: 'absolute',
          top: 0,
          left: 0,
          width: canvasWidth,
          height: '100000px',
        }}
      >
        {/* ─── SVG Links ──────────────────────────────────────────────── */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        >
          {visibleLinks.map((link, idx) => {
            const source = nodeMap.get(link.source);
            const target = nodeMap.get(link.target);
            if (!source || !target) return null;
            return (
              <line
                key={idx}
                x1={source.x}
                y1={source.y + NODE_HEIGHT / 2}
                x2={target.x}
                y2={target.y + NODE_HEIGHT / 2}
                stroke="#94a3b8"
                strokeWidth={1.5}
                opacity={0.5}
              />
            );
          })}
        </svg>

        {/* ─── Intro text (visible at default position) ──────────────── */}
        <div
          style={{
            position: 'absolute',
            left: 17500,
            top: -300,
            width: 800,
            pointerEvents: 'none',
          }}
        >
          <h1 className="text-6xl font-bold text-gray-800 tracking-tight mb-4">
            EMERGING TECH TREE
          </h1>
          <p className="text-xl text-gray-600 leading-relaxed max-w-lg">
            An interactive visualization of {nodes.length} technologies and their connections,
            from prehistoric tools to modern AI. Scroll and zoom to explore the full history of innovation.
          </p>
        </div>

        {/* ─── Node Cards ─────────────────────────────────────────────── */}
        {visibleNodes.map(node => (
          <div
            key={node.id}
            className="node-card absolute"
            style={{
              left: node.x,
              top: node.y,
              transform: 'translate(-50%, 0)',
              width: NODE_WIDTH,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedNode(node);
            }}
          >
            <div className="bg-white border border-gray-900 cursor-pointer hover:shadow-lg hover:shadow-gray-400/30 transition-shadow duration-150">
              {/* Image */}
              <div className="w-full h-[80px] border-b border-gray-900 overflow-hidden bg-gray-200 relative">
                {!failedImages.has(node.id) ? (
                  <img
                    src={node.image}
                    alt={node.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    style={{ objectPosition: node.imagePosition || 'center' }}
                    onError={() => handleImageError(node.id)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-300 to-gray-400">
                    <span className="text-gray-600 text-xs font-mono">{node.fields[0]?.[0] || '?'}</span>
                  </div>
                )}
              </div>

              {/* Title */}
              <div className="px-2 py-1.5">
                <div className="text-[10px] font-bold uppercase leading-tight text-gray-900 line-clamp-2">
                  {node.title}
                </div>
                {node.subtitle && (
                  <div className="text-[9px] text-gray-500 leading-tight mt-0.5 line-clamp-1">
                    {node.subtitle}
                  </div>
                )}
              </div>

              {/* Year */}
              <div className="px-2 pb-1">
                <span className="inline-block text-[9px] font-mono border border-gray-400 px-1 py-0.5 text-gray-700">
                  {formatYear(node.year)}
                </span>
              </div>

              {/* Field badges */}
              <div className="px-2 pb-2 flex flex-wrap gap-0.5">
                {node.fields.slice(0, 2).map(field => (
                  <span
                    key={field}
                    className="text-[8px] uppercase font-semibold px-1 py-0.5 rounded-sm text-white"
                    style={{ backgroundColor: getFieldColor(field) }}
                  >
                    {field}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Timeline Header (fixed overlay) ────────────────────────────── */}
      <div className="ui-overlay absolute top-0 left-0 right-0 h-10 bg-[#f5f0e8]/90 backdrop-blur-sm border-b border-gray-300 flex items-end pointer-events-none z-20">
        {timelineLabels.map(({ year, screenX }) => (
          <div
            key={year}
            className="absolute bottom-1"
            style={{ left: screenX }}
          >
            <span className="text-xs font-mono text-gray-500 whitespace-nowrap">
              {formatYear(year)}
            </span>
          </div>
        ))}
      </div>

      {/* ─── User Button (top-left) ─────────────────────────────────────── */}
      <div className="ui-overlay absolute top-3 left-3 z-30">
        <UserButton />
      </div>

      {/* ─── Search (top-right) ─────────────────────────────────────────── */}
      <div className="ui-overlay absolute top-3 right-3 z-30 w-72">
        <div className="relative">
          <input
            type="text"
            placeholder="Search techs/years/people"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 pl-9 text-sm border border-gray-400 rounded bg-white/95 backdrop-blur-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
          <svg className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Search results dropdown */}
        {searchResults.length > 0 && (
          <div className="mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-80 overflow-y-auto">
            {searchResults.map(node => (
              <button
                key={node.id}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 border-b border-gray-100 last:border-0"
                onClick={() => navigateToNode(node)}
              >
                <div className="text-sm font-semibold text-gray-800">{node.title}</div>
                <div className="text-xs text-gray-500">
                  {formatYear(node.year)} &middot; {node.fields.join(', ')}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Filter button */}
        <div className="mt-2 relative">
          <button
            onClick={() => setShowFieldDropdown(!showFieldDropdown)}
            className="w-full px-3 py-2 text-sm border border-gray-400 rounded bg-white/95 backdrop-blur-sm text-gray-700 text-left hover:bg-gray-50"
          >
            {selectedFields.size > 0
              ? `Filtering: ${selectedFields.size} field${selectedFields.size > 1 ? 's' : ''}`
              : 'Filter by field'}
            <svg className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showFieldDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-64 overflow-y-auto z-50">
              {selectedFields.size > 0 && (
                <button
                  onClick={() => setSelectedFields(new Set())}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 border-b border-gray-200 font-medium"
                >
                  Clear all filters
                </button>
              )}
              {allFields.map(field => (
                <button
                  key={field}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => toggleField(field)}
                >
                  <span
                    className="w-3 h-3 rounded-sm border flex-shrink-0"
                    style={{
                      backgroundColor: selectedFields.has(field) ? getFieldColor(field) : 'transparent',
                      borderColor: getFieldColor(field),
                    }}
                  />
                  <span className="text-xs text-gray-700">{field}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Mini Timeline (bottom, fixed) ──────────────────────────────── */}
      <div className="ui-overlay absolute bottom-4 left-16 right-16 z-20">
        <div className="relative h-8 bg-white/80 backdrop-blur-sm border border-gray-300 rounded-full px-4 flex items-center">
          {/* Full bar */}
          <div className="absolute left-4 right-4 h-0.5 bg-gray-300 top-1/2 -translate-y-1/2" />

          {/* Ticks */}
          {MINI_TIMELINE_TICKS.map(year => {
            const totalX = yearToX(year);
            const maxX = BREAKPOINTS[BREAKPOINTS.length - 1][1];
            const pct = (totalX / maxX) * 100;
            return (
              <button
                key={year}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group"
                style={{ left: `calc(${pct}% * 0.92 + 4%)` }}
                onClick={() => handleMiniTimelineClick(year)}
                title={formatYear(year)}
              >
                <div className="w-1 h-3 bg-gray-400 group-hover:bg-blue-500 transition-colors" />
                <span className="absolute top-4 left-1/2 -translate-x-1/2 text-[8px] text-gray-500 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  {formatYear(year)}
                </span>
              </button>
            );
          })}

          {/* Current position indicator */}
          {(() => {
            const currentX = yearToX(viewportCenterYear);
            const maxX = BREAKPOINTS[BREAKPOINTS.length - 1][1];
            const pct = (currentX / maxX) * 100;
            return (
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow"
                style={{ left: `calc(${pct}% * 0.92 + 4%)` }}
              />
            );
          })()}
        </div>
      </div>

      {/* ─── Zoom Controls (bottom-right) ───────────────────────────────── */}
      <div className="ui-overlay absolute bottom-16 right-4 z-30 flex flex-col items-center gap-1">
        <button
          onClick={zoomIn}
          className="w-8 h-8 bg-white border border-gray-300 rounded flex items-center justify-center text-gray-700 hover:bg-gray-50 text-lg font-bold"
        >
          +
        </button>
        <span className="text-xs font-mono text-gray-600 bg-white/90 px-1.5 py-0.5 rounded border border-gray-200">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={zoomOut}
          className="w-8 h-8 bg-white border border-gray-300 rounded flex items-center justify-center text-gray-700 hover:bg-gray-50 text-lg font-bold"
        >
          -
        </button>
      </div>

      {/* ─── Node count indicator ───────────────────────────────────────── */}
      <div className="ui-overlay absolute bottom-4 left-4 z-20">
        <span className="text-xs font-mono text-gray-500 bg-white/80 px-2 py-1 rounded border border-gray-200">
          {visibleNodes.length} / {filteredNodes.length} nodes
        </span>
      </div>

      {/* ─── Node Detail Modal ──────────────────────────────────────────── */}
      {selectedNode && (
        <div
          className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setSelectedNode(null)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal image */}
            <div className="relative h-48 bg-gray-200 overflow-hidden rounded-t-lg">
              {!failedImages.has(selectedNode.id) ? (
                <img
                  src={selectedNode.image}
                  alt={selectedNode.title}
                  className="w-full h-full object-cover"
                  style={{ objectPosition: selectedNode.imagePosition || 'center' }}
                  onError={() => handleImageError(selectedNode.id)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-300 to-gray-400">
                  <span className="text-4xl text-gray-500">{selectedNode.fields[0]?.[0] || '?'}</span>
                </div>
              )}
              <button
                onClick={() => setSelectedNode(null)}
                className="absolute top-3 right-3 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center text-gray-700 hover:bg-white shadow"
              >
                &times;
              </button>
            </div>

            {/* Modal content */}
            <div className="p-5">
              <h2 className="text-xl font-bold text-gray-900 uppercase">{selectedNode.title}</h2>
              {selectedNode.subtitle && (
                <p className="text-sm text-gray-500 mt-0.5">{selectedNode.subtitle}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-sm font-mono border border-gray-400 px-2 py-0.5 text-gray-700">
                  {formatYear(selectedNode.year)}
                </span>
                {selectedNode.type && (
                  <span className="text-sm border border-gray-300 px-2 py-0.5 text-gray-600 rounded">
                    {selectedNode.type}
                  </span>
                )}
              </div>

              {/* Fields */}
              <div className="mt-3 flex flex-wrap gap-1">
                {selectedNode.fields.map(field => (
                  <span
                    key={field}
                    className="text-xs uppercase font-semibold px-2 py-0.5 rounded text-white"
                    style={{ backgroundColor: getFieldColor(field) }}
                  >
                    {field}
                  </span>
                ))}
                {selectedNode.subfields.map(sf => (
                  <span
                    key={sf}
                    className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600"
                  >
                    {sf}
                  </span>
                ))}
              </div>

              {/* Details */}
              {selectedNode.details && (
                <p className="mt-3 text-sm text-gray-700 leading-relaxed">{selectedNode.details}</p>
              )}
              {selectedNode.dateDetails && (
                <p className="mt-2 text-xs text-gray-500 italic">{selectedNode.dateDetails}</p>
              )}

              {/* Metadata */}
              <div className="mt-4 space-y-1.5 text-sm text-gray-600">
                {selectedNode.inventors.length > 0 && (
                  <div><span className="font-medium text-gray-800">Inventors:</span> {selectedNode.inventors.join(', ')}</div>
                )}
                {selectedNode.organizations.length > 0 && (
                  <div><span className="font-medium text-gray-800">Organizations:</span> {selectedNode.organizations.join(', ')}</div>
                )}
                {selectedNode.formattedLocation && (
                  <div><span className="font-medium text-gray-800">Location:</span> {selectedNode.formattedLocation}</div>
                )}
              </div>

              {/* Connections */}
              {(() => {
                const { prerequisites, dependents } = getConnections(selectedNode.id);
                if (prerequisites.length === 0 && dependents.length === 0) return null;
                return (
                  <div className="mt-4 border-t border-gray-200 pt-3">
                    {prerequisites.length > 0 && (
                      <div className="mb-2">
                        <span className="text-xs font-semibold uppercase text-gray-500">Prerequisites:</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {prerequisites.map(p => (
                            <button
                              key={p.id}
                              className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-100"
                              onClick={() => setSelectedNode(p)}
                            >
                              {p.title} ({formatYear(p.year)})
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {dependents.length > 0 && (
                      <div>
                        <span className="text-xs font-semibold uppercase text-gray-500">Enables:</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {dependents.map(d => (
                            <button
                              key={d.id}
                              className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded hover:bg-green-100"
                              onClick={() => setSelectedNode(d)}
                            >
                              {d.title} ({formatYear(d.year)})
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Wikipedia link */}
              {selectedNode.wikipedia && (
                <div className="mt-4">
                  <a
                    href={selectedNode.wikipedia}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    View on Wikipedia &rarr;
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
