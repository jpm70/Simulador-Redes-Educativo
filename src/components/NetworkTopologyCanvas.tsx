import React, { useRef, useState, useMemo } from 'react';
import { NetworkNode, NetworkLink, SimulatedPacket, PacketAnimationStep } from '../types/network';
import { ZONE_DEFINITIONS } from '../data/topologyData';
import {
  Monitor,
  HardDrive,
  Router,
  Wifi,
  Server,
  Cloud,
  Smartphone,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  Route,
  X,
  ChevronRight,
  Info,
  CheckCircle,
  AlertOctagon,
  Zap,
} from 'lucide-react';

interface CanvasProps {
  nodes: NetworkNode[];
  links: NetworkLink[];
  activePackets: SimulatedPacket[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  onOpenDeviceDetail: (node: NetworkNode) => void;
  highlightedPacket: SimulatedPacket | null;
  onClearHighlightedPath: () => void;
  deliveredPacketsHistory?: SimulatedPacket[];
  onSelectPacketForPath?: (pkt: SimulatedPacket) => void;
  routerMode?: 'interconnected' | 'independent';
  onToggleRouterMode?: () => void;
  onToggleLink?: (linkId: string) => void;
}

export const NetworkTopologyCanvas: React.FC<CanvasProps> = ({
  nodes,
  links,
  activePackets,
  selectedNodeId,
  onSelectNode,
  showLabels,
  onToggleLabels,
  onOpenDeviceDetail,
  highlightedPacket,
  onClearHighlightedPath,
  deliveredPacketsHistory = [],
  onSelectPacketForPath,
  routerMode = 'interconnected',
  onToggleRouterMode,
  onToggleLink,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(0.92);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 20, y: 10 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [activeHopExplanationIndex, setActiveHopExplanationIndex] = useState<number | null>(null);

  // Pan controls
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).tagName === 'rect') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoom(0.92);
    setPan({ x: 20, y: 10 });
  };

  // Node Icon Helper
  const renderNodeIcon = (type: string, isSelected: boolean) => {
    const size = 20;
    const colorClass = isSelected ? 'text-white' : 'text-slate-300';
    switch (type) {
      case 'pc':
        return <Monitor size={size} className={colorClass} />;
      case 'mobile':
        return <Smartphone size={size} className={colorClass} />;
      case 'switch':
        return <HardDrive size={size} className={colorClass} />;
      case 'router':
        return <Router size={size} className={colorClass} />;
      case 'ap':
        return <Wifi size={size} className={colorClass} />;
      case 'server':
        return <Server size={size} className={colorClass} />;
      case 'cloud':
        return <Cloud size={size} className={colorClass} />;
      default:
        return <Monitor size={size} className={colorClass} />;
    }
  };

  // Traversed nodes & links mapping for the highlighted delivered packet
  const pathDetails = useMemo(() => {
    if (!highlightedPacket || !highlightedPacket.steps || highlightedPacket.steps.length === 0) {
      return null;
    }

    const steps = highlightedPacket.steps;
    const traversedNodes: {
      id: string;
      hopNumber: number;
      role: string;
      explanation: string;
      isDropped?: boolean;
    }[] = [];

    // First node (origin)
    const firstStep = steps[0];
    traversedNodes.push({
      id: firstStep.fromNodeId,
      hopNumber: 1,
      role: 'Origen',
      explanation: `Nodo origen donde se originó el tráfico ${highlightedPacket.protocol}.`,
    });

    // Subsequent nodes
    steps.forEach((step, idx) => {
      const nodeObj = nodes.find((n) => n.id === step.toNodeId);
      const isLast = idx === steps.length - 1;
      let role = 'Nodo Intermedio';

      if (step.isDropped) {
        role = 'Descarte (Firewall Drop)';
      } else if (isLast) {
        role = 'Destino Final';
      } else if (nodeObj?.type === 'switch') {
        role = 'Conmutación L2';
      } else if (nodeObj?.type === 'router') {
        role = 'Enrutamiento L3';
      } else if (nodeObj?.type === 'ap') {
        role = 'Punto Acceso Wi-Fi';
      }

      traversedNodes.push({
        id: step.toNodeId,
        hopNumber: idx + 2,
        role,
        explanation: step.explanation,
        isDropped: step.isDropped,
      });
    });

    // Set of link IDs traversed
    const linkKeys = new Set<string>();
    steps.forEach((s) => {
      linkKeys.add(`${s.fromNodeId}->${s.toNodeId}`);
      linkKeys.add(`${s.toNodeId}->${s.fromNodeId}`);
      linkKeys.add(s.linkId);
    });

    return { steps, traversedNodes, linkKeys };
  }, [highlightedPacket, nodes]);

  // Node color helper
  const getNodeColor = (node: NetworkNode) => {
    if (node.id === selectedNodeId) return '#38bdf8'; // Sky 400
    if (node.type === 'router') return '#6366f1'; // Indigo
    if (node.type === 'server') return '#10b981'; // Emerald
    if (node.type === 'switch') return '#64748b'; // Slate
    if (node.type === 'ap') return '#f59e0b'; // Amber
    if (node.type === 'cloud') return '#06b6d4'; // Cyan
    return '#475569';
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-slate-950 select-none cursor-grab active:cursor-grabbing border border-slate-800 rounded-xl"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 shadow-xl">
        <span className="text-xs font-semibold text-slate-300 mr-1">Topología de Red</span>
        <span className="text-slate-600">|</span>
        <button
          onClick={() => setZoom((z) => Math.min(z + 0.15, 2.0))}
          className="p-1 text-slate-400 hover:text-white transition-colors"
          title="Acercar (Zoom In)"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(z - 0.15, 0.4))}
          className="p-1 text-slate-400 hover:text-white transition-colors"
          title="Alejar (Zoom Out)"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={resetView}
          className="p-1 text-slate-400 hover:text-white transition-colors"
          title="Centrar Vista"
        >
          <Maximize2 size={16} />
        </button>
        <span className="text-slate-600">|</span>
        <button
          onClick={onToggleLabels}
          className={`flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded transition-colors ${
            showLabels ? 'bg-sky-950 text-sky-400 border border-sky-800/50' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Mostrar/Ocultar IPs y MACs en el mapa"
        >
          <Layers size={13} />
          <span>{showLabels ? 'Ocultar IPs' : 'Ver IPs'}</span>
        </button>

        {/* Router Mode Switcher */}
        {onToggleRouterMode && (
          <>
            <span className="text-slate-600">|</span>
            <button
              onClick={onToggleRouterMode}
              className={`flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded border transition-colors ${
                routerMode === 'interconnected'
                  ? 'bg-indigo-950 text-indigo-300 border-indigo-800 hover:bg-indigo-900'
                  : 'bg-amber-950 text-amber-300 border-amber-800 hover:bg-amber-900'
              }`}
              title="Alternar entre Routers Conectados y Redes Independientes (Aisladas)"
            >
              <span>{routerMode === 'interconnected' ? '🔗 Troncal Conectado' : '✂️ Redes Independientes'}</span>
            </button>
          </>
        )}

        {/* Path Highlight Selector / Status */}
        {deliveredPacketsHistory.length > 0 && onSelectPacketForPath && (
          <>
            <span className="text-slate-600">|</span>
            <div className="flex items-center gap-1.5 text-xs">
              <Route size={13} className="text-amber-400" />
              <select
                value={highlightedPacket ? highlightedPacket.id : ''}
                onChange={(e) => {
                  if (e.target.value === '') {
                    onClearHighlightedPath();
                  } else {
                    const found = deliveredPacketsHistory.find((p) => p.id === e.target.value);
                    if (found) onSelectPacketForPath(found);
                  }
                }}
                className="bg-slate-950 text-slate-200 border border-slate-700 rounded px-2 py-0.5 text-[11px] font-mono focus:outline-none cursor-pointer max-w-[210px] truncate"
              >
                <option value="">-- Resaltar Camino de Paquete --</option>
                {deliveredPacketsHistory.slice(0, 10).map((p, idx) => (
                  <option key={p.id} value={p.id}>
                    #{idx + 1} {p.protocol}: {p.summary.slice(0, 36)}...
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {highlightedPacket && (
          <button
            onClick={onClearHighlightedPath}
            className="flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800/60 rounded transition-colors"
            title="Quitar resaltado de camino"
          >
            <X size={12} />
            <span>Quitar Resaltado</span>
          </button>
        )}
      </div>

      {/* Floating Path Breadcrumb Banner (When a packet path is highlighted) */}
      {highlightedPacket && pathDetails && (
        <div className="absolute top-16 left-4 right-4 z-20 bg-slate-900/95 backdrop-blur-md px-4 py-2.5 rounded-xl border border-sky-800/70 shadow-2xl flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs font-bold text-sky-400 font-sans">
                <Route size={15} />
                Camino Completo Recorrido:
              </span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                {highlightedPacket.protocol} · {pathDetails.steps.length} saltos
              </span>
              {highlightedPacket.totalLatencyMs !== undefined && highlightedPacket.totalLatencyMs > 0 && (
                <span className="flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-800">
                  <Zap size={11} className="text-amber-400" />
                  RTT / Latencia: {highlightedPacket.totalLatencyMs}ms
                </span>
              )}
              {highlightedPacket.status === 'dropped' ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-400">
                  <AlertOctagon size={13} /> Descartado por Firewall
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                  <CheckCircle size={13} /> Entregado con Éxito
                </span>
              )}
            </div>

            <button
              onClick={onClearHighlightedPath}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Sequential Hops Breadcrumb */}
          <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-thin pb-1">
            {pathDetails.traversedNodes.map((n, idx) => {
              const nodeObj = nodes.find((item) => item.id === n.id);
              const isHoveredOrActive = activeHopExplanationIndex === idx;

              return (
                <React.Fragment key={n.id}>
                  {idx > 0 && <ChevronRight size={13} className="text-slate-600 shrink-0" />}
                  <button
                    onClick={() => setActiveHopExplanationIndex(idx)}
                    onMouseEnter={() => setActiveHopExplanationIndex(idx)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all shrink-0 ${
                      n.isDropped
                        ? 'bg-rose-950/70 text-rose-300 border-rose-700'
                        : isHoveredOrActive
                        ? 'bg-sky-600 text-white border-sky-400 shadow-md'
                        : 'bg-slate-950 text-slate-200 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-[10px] flex items-center justify-center font-bold">
                      {n.hopNumber}
                    </span>
                    <span className="font-semibold">{nodeObj?.name || n.id}</span>
                    <span className="text-[10px] opacity-70">({n.role})</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {/* Detailed step explanation callout */}
          {activeHopExplanationIndex !== null && pathDetails.traversedNodes[activeHopExplanationIndex] && (
            <div className="text-[11px] font-mono text-sky-200 bg-slate-950 p-2 rounded border border-slate-800 flex items-center gap-2">
              <Info size={13} className="text-sky-400 shrink-0" />
              <span>
                <strong>Salto {pathDetails.traversedNodes[activeHopExplanationIndex].hopNumber}:</strong>{' '}
                {pathDetails.traversedNodes[activeHopExplanationIndex].explanation}
              </span>
            </div>
          )}
        </div>
      )}

      {/* SVG Canvas */}
      <svg
        className="w-full h-full"
        viewBox="0 0 1520 720"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          transition: isDragging ? 'none' : 'transform 0.1s ease-out',
        }}
      >
        <defs>
          {/* Subtle Grid Pattern */}
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="15" cy="15" r="0.75" fill="#334155" opacity="0.4" />
          </pattern>
          {/* Link Glow Filter */}
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          {/* Path Arrow Marker */}
          <marker
            id="path-arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 1 L 8 5 L 0 9 z" fill="#38bdf8" />
          </marker>
        </defs>

        {/* Background Grid */}
        <rect width="2000" height="1200" fill="url(#grid)" />

        {/* 1. Zone Boxes (Demarcated network segments) */}
        {Object.entries(ZONE_DEFINITIONS).map(([zoneKey, zone]) => (
          <g key={zoneKey}>
            <rect
              x={zone.x}
              y={zone.y}
              width={zone.width}
              height={zone.height}
              rx={12}
              fill={zone.bg}
              stroke={zone.borderColor}
              strokeWidth={1.5}
              strokeDasharray={zoneKey === 'wifi-guest' ? '4 4' : 'none'}
            />
            {/* Zone Header Title & Subnet */}
            <text
              x={zone.x + 16}
              y={zone.y + 24}
              fill={zone.color}
              fontSize="12"
              fontWeight="600"
              fontFamily="Plus Jakarta Sans, sans-serif"
            >
              {zone.title}
            </text>
            <text
              x={zone.x + 16}
              y={zone.y + 40}
              fill="#94a3b8"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
            >
              {zone.subnet}
            </text>
          </g>
        ))}

        {/* 2. Base Physical & Logical Cable Links */}
        {links.map((link) => {
          const fromNode = nodes.find((n) => n.id === link.fromNodeId);
          const toNode = nodes.find((n) => n.id === link.toNodeId);
          if (!fromNode || !toNode) return null;

          const isTrunk = link.type === 'trunk';
          const isWifi = link.type === 'wifi';
          const isInterRouterTrunk = link.id === 'link-trunk-routers';
          const isTrunkDown = isInterRouterTrunk && routerMode === 'independent';
          const isLinkDown = link.status === 'down' || isTrunkDown;

          const strokeColor = isLinkDown ? '#ef4444' : isTrunk ? '#818cf8' : isWifi ? '#f59e0b' : '#334155';
          const strokeWidth = isLinkDown ? 3 : isTrunk ? 3 : isWifi ? 1.5 : 2;

          return (
            <g key={link.id}>
              {/* Cable line with clickable fault simulator */}
              <line
                x1={fromNode.x}
                y1={fromNode.y}
                x2={toNode.x}
                y2={toNode.y}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={isLinkDown ? '6 6' : isWifi ? '3 3' : 'none'}
                opacity={isLinkDown ? 0.95 : 0.8}
                className="cursor-pointer"
                onClick={() => {
                  if (isInterRouterTrunk && onToggleRouterMode) {
                    onToggleRouterMode();
                  } else if (onToggleLink) {
                    onToggleLink(link.id);
                  }
                }}
              >
                <title>{isLinkDown ? 'Enlace caído (DOWN) - Click para reconectar' : `Enlace ${link.bandwidthMbps}Mbps (${link.fromPort} ↔ ${link.toPort}) - Click para simular corte físico`}</title>
              </line>

              {/* Port or Link labels if trunk */}
              {isTrunk && (
                <g
                  className="cursor-pointer"
                  onClick={() => {
                    if (isInterRouterTrunk && onToggleRouterMode) {
                      onToggleRouterMode();
                    } else if (onToggleLink) {
                      onToggleLink(link.id);
                    }
                  }}
                >
                  <rect
                    x={(fromNode.x + toNode.x) / 2 - (isLinkDown ? 95 : 55)}
                    y={(fromNode.y + toNode.y) / 2 - 10}
                    width={isLinkDown ? 190 : 110}
                    height={20}
                    rx={4}
                    fill={isLinkDown ? '#450a0a' : '#1e1b4b'}
                    stroke={isLinkDown ? '#b91c1c' : '#4338ca'}
                    strokeWidth={1}
                  />
                  <text
                    x={(fromNode.x + toNode.x) / 2}
                    y={(fromNode.y + toNode.y) / 2 + 4}
                    textAnchor="middle"
                    fill={isLinkDown ? '#fca5a5' : '#c7d2fe'}
                    fontSize="8.5"
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {isLinkDown ? '✂️ TRONCAL APAGADO (AISLADAS)' : `🔗 TRUNK 10G (${(link.currentLatency || 3).toFixed(1)}ms)`}
                  </text>
                </g>
              )}

              {/* Down link warning badge for standard links */}
              {isLinkDown && !isTrunk && (
                <g
                  className="cursor-pointer"
                  onClick={() => onToggleLink && onToggleLink(link.id)}
                  transform={`translate(${(fromNode.x + toNode.x) / 2}, ${(fromNode.y + toNode.y) / 2})`}
                >
                  <rect
                    x={-45}
                    y={-9}
                    width={90}
                    height={18}
                    rx={4}
                    fill="#450a0a"
                    stroke="#ef4444"
                    strokeWidth={1.2}
                  />
                  <text
                    textAnchor="middle"
                    y={3.5}
                    fill="#fca5a5"
                    fontSize="8.5"
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    ✂️ LINK DOWN
                  </text>
                </g>
              )}

              {/* Dynamic Fluctuating Link Latency Badge (Real-time queueing & physical propagation delay) */}
              {showLabels && !isLinkDown && !isTrunk && (
                <g
                  className="cursor-pointer group"
                  onClick={() => onToggleLink && onToggleLink(link.id)}
                  transform={`translate(${(fromNode.x + toNode.x) / 2}, ${(fromNode.y + toNode.y) / 2})`}
                >
                  <title>Click para simular caída física de este enlace ({link.fromPort} ↔ {link.toPort})</title>
                  <rect
                    x={-19}
                    y={-7}
                    width={38}
                    height={14}
                    rx={3}
                    fill={
                      (link.currentLatency || link.latency || 1) >= 15
                        ? '#450a0a'
                        : (link.currentLatency || link.latency || 1) >= 5
                        ? '#3b2507'
                        : '#090d16'
                    }
                    stroke={
                      (link.currentLatency || link.latency || 1) >= 15
                        ? '#ef4444'
                        : (link.currentLatency || link.latency || 1) >= 5
                        ? '#f59e0b'
                        : '#334155'
                    }
                    strokeWidth={1}
                    opacity={0.92}
                  />
                  <text
                    textAnchor="middle"
                    y={3}
                    fill={
                      (link.currentLatency || link.latency || 1) >= 15
                        ? '#fca5a5'
                        : (link.currentLatency || link.latency || 1) >= 5
                        ? '#fde68a'
                        : '#94a3b8'
                    }
                    fontSize="8"
                    fontWeight="600"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {(link.currentLatency || link.latency || 1).toFixed(1)}ms
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* 3. HIGHLIGHTED PACKET ROUTE (Cables / Links traversed) */}
        {pathDetails &&
          pathDetails.steps.map((step, idx) => {
            const fromNode = nodes.find((n) => n.id === step.fromNodeId);
            const toNode = nodes.find((n) => n.id === step.toNodeId);
            if (!fromNode || !toNode) return null;

            const pathColor = step.isDropped
              ? '#f43f5e'
              : highlightedPacket?.color || '#38bdf8';

            return (
              <g key={`highlight-link-${idx}`}>
                {/* Thick Neon Glow Along Traversed Cable */}
                <line
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke={pathColor}
                  strokeWidth={9}
                  opacity={0.3}
                  filter="url(#glow)"
                />
                {/* Animated Traversed Segment Line with Flow Dashes */}
                <line
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke={pathColor}
                  strokeWidth={3.5}
                  strokeDasharray="8 4"
                  opacity={0.95}
                />
                {/* Hop Step Number Badge in Midpoint */}
                <g
                  transform={`translate(${
                    (fromNode.x + toNode.x) / 2
                  }, ${(fromNode.y + toNode.y) / 2})`}
                >
                  <circle r={10} fill="#0f172a" stroke={pathColor} strokeWidth={1.5} />
                  <text
                    textAnchor="middle"
                    y={3.5}
                    fill="#ffffff"
                    fontSize="9.5"
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {idx + 1}
                  </text>
                </g>
              </g>
            );
          })}

        {/* 4. Traveling Active Packets (Real-time in-flight animations) */}
        {activePackets.map((pkt) => {
          const currentStep = pkt.steps[pkt.currentStepIndex];
          if (!currentStep) return null;

          const fromNode = nodes.find((n) => n.id === currentStep.fromNodeId);
          const toNode = nodes.find((n) => n.id === currentStep.toNodeId);
          if (!fromNode || !toNode) return null;

          const posX = fromNode.x + (toNode.x - fromNode.x) * pkt.progress;
          const posY = fromNode.y + (toNode.y - fromNode.y) * pkt.progress;

          return (
            <g key={pkt.id} transform={`translate(${posX}, ${posY})`}>
              <circle r={14} fill={pkt.color} opacity={0.3} filter="url(#glow)" />
              <circle r={8} fill={pkt.color} stroke="#ffffff" strokeWidth={1.5} />
              
              <g transform="translate(0, -18)">
                <rect
                  x={-22}
                  y={-9}
                  width={44}
                  height={18}
                  rx={4}
                  fill="#0f172a"
                  stroke={pkt.color}
                  strokeWidth={1.2}
                />
                <text
                  textAnchor="middle"
                  y={4}
                  fill="#ffffff"
                  fontSize="9"
                  fontWeight="700"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {pkt.protocol}
                </text>
              </g>

              {currentStep.isDropped && pkt.progress >= 0.95 && (
                <g transform="translate(14, -14)">
                  <circle r={9} fill="#dc2626" stroke="#ffffff" strokeWidth={1.5} />
                  <text textAnchor="middle" y={3} fill="#ffffff" fontSize="10" fontWeight="bold">✕</text>
                </g>
              )}
            </g>
          );
        })}

        {/* 5. Network Nodes (PCs, Switches, Routers, APs, Servers) */}
        {nodes.map((node) => {
          const isSelected = node.id === selectedNodeId;
          const isHovered = node.id === hoveredNodeId;
          const nodeColor = getNodeColor(node);

          // Check if this node is in the highlighted delivered packet's route
          const traversedInfo = pathDetails?.traversedNodes.find((t) => t.id === node.id);

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(node.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onOpenDeviceDetail(node);
              }}
              onMouseEnter={() => setHoveredNodeId(node.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
            >
              {/* Highlighted Traversed Node Ring (When path is highlighted) */}
              {traversedInfo && (
                <g>
                  <circle
                    r={32}
                    fill="none"
                    stroke={traversedInfo.isDropped ? '#f43f5e' : '#38bdf8'}
                    strokeWidth={2.5}
                    strokeDasharray={traversedInfo.isDropped ? '3 3' : 'none'}
                    opacity={0.8}
                    filter="url(#glow)"
                  />
                  {/* Sequence Badge on the Top-Right of the Node */}
                  <g transform="translate(18, -18)">
                    <circle
                      r={10}
                      fill={traversedInfo.isDropped ? '#dc2626' : '#0284c7'}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                    <text
                      textAnchor="middle"
                      y={3.5}
                      fill="#ffffff"
                      fontSize="9.5"
                      fontWeight="bold"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {traversedInfo.isDropped ? '✕' : traversedInfo.hopNumber}
                    </text>
                  </g>
                </g>
              )}

              {/* Selection Ring */}
              {isSelected && !traversedInfo && (
                <rect
                  x={-28}
                  y={-28}
                  width={56}
                  height={56}
                  rx={14}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  className="animate-pulse"
                />
              )}

              {/* Node Main Shape */}
              <rect
                x={-22}
                y={-22}
                width={44}
                height={44}
                rx={10}
                fill={isSelected ? '#0369a1' : isHovered ? '#1e293b' : '#0f172a'}
                stroke={traversedInfo ? (traversedInfo.isDropped ? '#f43f5e' : '#38bdf8') : isSelected ? '#38bdf8' : nodeColor}
                strokeWidth={traversedInfo ? 2.5 : isSelected ? 2.5 : 1.5}
                filter="drop-shadow(0 4px 6px rgba(0,0,0,0.5))"
              />

              {/* Icon */}
              <foreignObject x={-10} y={-10} width={20} height={20}>
                <div className="flex items-center justify-center w-full h-full">
                  {renderNodeIcon(node.type, isSelected)}
                </div>
              </foreignObject>

              {/* Status Indicator (online) */}
              <circle
                cx={15}
                cy={-15}
                r={4}
                fill={node.isOnline ? '#22c55e' : '#ef4444'}
                stroke="#0f172a"
                strokeWidth={1}
              />

              {/* Node Name */}
              <text
                x={0}
                y={32}
                textAnchor="middle"
                fill={traversedInfo ? '#38bdf8' : isSelected ? '#38bdf8' : '#f1f5f9'}
                fontSize="11"
                fontWeight="600"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                {node.name}
              </text>

              {/* Node Primary IP / Role */}
              {showLabels && node.primaryIp && (
                <text
                  x={0}
                  y={46}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {node.primaryIp}
                </text>
              )}

              {/* If switch, show 802.1Q VLAN badge */}
              {showLabels && node.type === 'switch' && (
                <text
                  x={0}
                  y={46}
                  textAnchor="middle"
                  fill="#818cf8"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                >
                  IEEE 802.1Q
                </text>
              )}

              {/* Role badge if traversed */}
              {traversedInfo && (
                <text
                  x={0}
                  y={showLabels && node.primaryIp ? 59 : 46}
                  textAnchor="middle"
                  fill={traversedInfo.isDropped ? '#f43f5e' : '#38bdf8'}
                  fontSize="9"
                  fontWeight="600"
                  fontFamily="JetBrains Mono, monospace"
                >
                  [{traversedInfo.role}]
                </text>
              )}

              {/* Double-click hint on hover */}
              {isHovered && !traversedInfo && (
                <g transform="translate(0, -32)">
                  <rect x={-55} y={-16} width={110} height={20} rx={4} fill="#090d16" stroke="#334155" strokeWidth={1} />
                  <text textAnchor="middle" y={-2} fill="#93c5fd" fontSize="9" fontFamily="Plus Jakarta Sans, sans-serif">
                    Doble clic para detalles
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Bottom Legend */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-wrap items-center gap-4 bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-lg border border-slate-800 text-xs text-slate-300">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
          <span>ICMP (Ping)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
          <span>ARP Request</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
          <span>Reply / OK</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-violet-400"></span>
          <span>DNS</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span>
          <span>HTTP</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-pink-400"></span>
          <span>TCP Handshake</span>
        </div>
        {highlightedPacket && (
          <div className="flex items-center gap-1.5 text-sky-400 font-semibold border-l border-slate-700 pl-3">
            <Route size={13} />
            <span>Camino Resaltado Activo</span>
          </div>
        )}
      </div>
    </div>
  );
};
