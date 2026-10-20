import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts';
import { SimulatedPacket, NetworkNode, NetworkLink, SubnetThresholds, RouterInterconnectionMode } from '../types/network';
import {
  Activity,
  AlertTriangle,
  ShieldAlert,
  BarChart3,
  Zap,
  Sliders,
  CheckCircle2,
  Bell,
  BellOff,
  Flame,
  Radio,
  Clock,
} from 'lucide-react';

export interface TrafficTimePoint {
  time: string;
  aulas: number; // bytes or packets
  invitados: number;
  admin: number;
  errors: number;
}

interface TelemetryDashboardProps {
  timeSeriesData: TrafficTimePoint[];
  packetLogs: SimulatedPacket[];
  nodes: NetworkNode[];
  links?: NetworkLink[];
  onGenerateBurst: (type: 'normal' | 'guest_attack' | 'web_surge') => void;
  thresholds: SubnetThresholds;
  onUpdateThresholds: (thresholds: SubnetThresholds) => void;
  routerMode: RouterInterconnectionMode;
  onToggleRouterMode: () => void;
}

export const NetworkTelemetryDashboard: React.FC<TelemetryDashboardProps> = ({
  timeSeriesData,
  packetLogs,
  nodes,
  links = [],
  onGenerateBurst,
  thresholds,
  onUpdateThresholds,
  routerMode,
  onToggleRouterMode,
}) => {
  const [showConfigPanel, setShowConfigPanel] = useState<boolean>(false);

  // Latest sample point from time series
  const latestPoint = timeSeriesData[timeSeriesData.length - 1] || {
    time: '00:00',
    aulas: 0,
    invitados: 0,
    admin: 0,
    errors: 0,
  };

  // Evaluate threshold breaches
  const breaches = useMemo(() => {
    if (!thresholds.enabled) {
      return {
        aulas: false,
        invitados: false,
        admin: false,
        errors: false,
        any: false,
        list: [],
      };
    }

    const aulasBreached = latestPoint.aulas > thresholds.aulas;
    const invitadosBreached = latestPoint.invitados > thresholds.invitados;
    const adminBreached = latestPoint.admin > thresholds.admin;
    const errorsBreached = latestPoint.errors >= thresholds.errors;

    const list: string[] = [];
    if (aulasBreached) list.push(`Aulas: ${latestPoint.aulas} B (Límite: ${thresholds.aulas} B)`);
    if (invitadosBreached) list.push(`Invitados: ${latestPoint.invitados} B (Límite: ${thresholds.invitados} B)`);
    if (adminBreached) list.push(`Administración: ${latestPoint.admin} B (Límite: ${thresholds.admin} B)`);
    if (errorsBreached) list.push(`Descartes/Errores: ${latestPoint.errors} drops (Límite: ${thresholds.errors})`);

    return {
      aulas: aulasBreached,
      invitados: invitadosBreached,
      admin: adminBreached,
      errors: errorsBreached,
      any: list.length > 0,
      list,
    };
  }, [latestPoint, thresholds]);

  // Aggregate statistics by subnet
  const subnetStats = useMemo(() => {
    let aulasCount = 0;
    let aulasBytes = 0;
    let invitadosCount = 0;
    let invitadosBytes = 0;
    let adminCount = 0;
    let adminBytes = 0;
    let totalErrors = 0;

    packetLogs.forEach((pkt) => {
      const srcNode = nodes.find((n) => n.id === pkt.sourceNodeId);
      const isError = pkt.status === 'dropped' || pkt.layer4.icmpType === 'Dest Unreachable';

      if (isError) totalErrors++;

      if (srcNode) {
        if (srcNode.zone === 'aula1' || srcNode.zone === 'aula2' || srcNode.zone === 'aula3') {
          aulasCount++;
          aulasBytes += pkt.sizeBytes;
        } else if (srcNode.zone === 'wifi-guest') {
          invitadosCount++;
          invitadosBytes += pkt.sizeBytes;
        } else if (srcNode.zone === 'admin-zone1' || srcNode.zone === 'admin-zone2') {
          adminCount++;
          adminBytes += pkt.sizeBytes;
        }
      }
    });

    const totalPackets = packetLogs.length;
    const errorRate = totalPackets > 0 ? ((totalErrors / totalPackets) * 100).toFixed(1) : '0.0';

    return {
      aulasCount,
      aulasBytes,
      invitadosCount,
      invitadosBytes,
      adminCount,
      adminBytes,
      totalErrors,
      totalPackets,
      errorRate,
    };
  }, [packetLogs, nodes]);

  // Protocol Distribution for Pie Chart
  const protocolDistribution = useMemo(() => {
    const counts: Record<string, number> = {
      ICMP: 0,
      ARP: 0,
      DNS: 0,
      HTTP: 0,
      TCP: 0,
    };

    packetLogs.forEach((p) => {
      if (counts[p.protocol] !== undefined) {
        counts[p.protocol]++;
      } else {
        counts[p.protocol] = 1;
      }
    });

    return [
      { name: 'ICMP (Ping)', value: counts.ICMP || 1, color: '#0284c7' },
      { name: 'ARP', value: counts.ARP || 1, color: '#eab308' },
      { name: 'DNS', value: counts.DNS || 1, color: '#8b5cf6' },
      { name: 'HTTP', value: counts.HTTP || 1, color: '#f97316' },
      { name: 'TCP Handshake', value: counts.TCP || 1, color: '#ec4899' },
    ];
  }, [packetLogs]);

  // Subnet Bar Chart Data with Dynamic Threshold Colors
  const subnetComparisonData = [
    {
      name: 'Aulas 1-3',
      paquetes: subnetStats.aulasCount,
      bytes: subnetStats.aulasBytes,
      subred: '192.168.10-30.0/24',
      fill: breaches.aulas ? '#f43f5e' : '#0284c7', // Color alert if threshold breached
    },
    {
      name: 'Wi-Fi Invitados',
      paquetes: subnetStats.invitadosCount,
      bytes: subnetStats.invitadosBytes,
      subred: '172.16.50.0/24',
      fill: breaches.invitados ? '#f43f5e' : '#f59e0b',
    },
    {
      name: 'Administración',
      paquetes: subnetStats.adminCount,
      bytes: subnetStats.adminBytes,
      subred: '192.168.100/200.0/24',
      fill: breaches.admin ? '#f43f5e' : '#10b981',
    },
  ];

  // Dynamic Chart Colors (Shift to alert red if threshold is breached)
  const aulasColor = breaches.aulas ? '#f43f5e' : '#0284c7';
  const invitadosColor = breaches.invitados ? '#f43f5e' : '#f59e0b';
  const adminColor = breaches.admin ? '#f43f5e' : '#10b981';
  const errorsColor = breaches.errors ? '#dc2626' : '#f43f5e';

  // Real-time link latency metrics by network segment
  const latencySummary = useMemo(() => {
    const aulasLinks = links.filter(
      (l) => l.id.startsWith('link-pc1') || l.id.startsWith('link-pc2') || l.id.startsWith('link-pc3') || l.id.startsWith('link-sw')
    );
    const guestLinks = links.filter((l) => l.type === 'wifi' || l.id === 'link-ap-racad');
    const adminLinks = links.filter((l) => l.id.includes('admin'));
    const trunkLink = links.find((l) => l.id === 'link-trunk-routers');
    const wanLink = links.find((l) => l.id === 'link-radmin-wan');

    const avg = (arr: NetworkLink[], fallback: number) =>
      arr.length > 0
        ? Number((arr.reduce((acc, l) => acc + (l.currentLatency || l.latency), 0) / arr.length).toFixed(1))
        : fallback;

    const aulasLat = avg(aulasLinks, 1.2);
    const guestLat = avg(guestLinks, 4.5);
    const adminLat = avg(adminLinks, 1.3);
    const trunkLat = trunkLink?.currentLatency ? Number(trunkLink.currentLatency.toFixed(1)) : 3.0;
    const wanLat = wanLink?.currentLatency ? Number(wanLink.currentLatency.toFixed(1)) : 25.5;

    return { aulasLat, guestLat, adminLat, trunkLat, wanLat };
  }, [links]);

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden font-sans text-xs shadow-2xl">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <BarChart3 size={15} className="text-sky-400" />
          <span className="font-semibold text-slate-200">Panel de Telemetría y Tráfico en Tiempo Real</span>
          <span className="text-slate-500 font-mono text-[11px]">
            ({subnetStats.totalPackets} paquetes monitorizados)
          </span>
        </div>

        {/* Controls: Mode & Threshold Config */}
        <div className="flex items-center gap-2">
          {/* Topology Router Mode Indicator & Switch */}
          <button
            onClick={onToggleRouterMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
              routerMode === 'interconnected'
                ? 'bg-indigo-950 text-indigo-300 border-indigo-800/80 hover:bg-indigo-900'
                : 'bg-amber-950 text-amber-300 border-amber-800/80 hover:bg-amber-900'
            }`}
            title="Alternar entre Routers Conectados (Troncal L3) y Redes Independientes (Aisladas)"
          >
            <Radio size={12} className={routerMode === 'interconnected' ? 'text-indigo-400' : 'text-amber-400'} />
            <span>
              {routerMode === 'interconnected'
                ? 'Troncal 10G Activo (Conectados)'
                : 'Redes Independientes (Aisladas)'}
            </span>
          </button>

          {/* Threshold Config Toggle */}
          <button
            onClick={() => setShowConfigPanel(!showConfigPanel)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
              showConfigPanel
                ? 'bg-sky-600 text-white border-sky-500'
                : breaches.any
                ? 'bg-rose-950 text-rose-300 border-rose-800 animate-pulse'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Abrir configuración de umbrales de tráfico"
          >
            <Sliders size={12} />
            <span>Configurar Umbrales</span>
            {breaches.any && <span className="w-2 h-2 rounded-full bg-rose-400 ml-0.5"></span>}
          </button>

          {/* Traffic Simulation Bursts */}
          <button
            onClick={() => onGenerateBurst('normal')}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium border border-slate-700 transition-colors"
            title="Ráfaga normal en aulas"
          >
            Ráfaga Aulas
          </button>
          <button
            onClick={() => onGenerateBurst('guest_attack')}
            className="px-2 py-1 bg-rose-950 hover:bg-rose-900 text-rose-300 rounded text-[11px] font-medium border border-rose-800/60 transition-colors"
            title="Simular intrusión desde Wi-Fi (Drop)"
          >
            Ataque Invitado (Drop)
          </button>
        </div>
      </div>

      {/* Threshold Configuration Drawer / Panel */}
      {showConfigPanel && (
        <div className="p-4 bg-slate-900/95 border-b border-slate-800 space-y-3 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders size={14} className="text-sky-400" />
              <span className="font-bold text-slate-100 text-xs">
                Configuración de Umbrales de Alerta de Tráfico por Subred
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  onUpdateThresholds({
                    ...thresholds,
                    enabled: !thresholds.enabled,
                  })
                }
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                  thresholds.enabled
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {thresholds.enabled ? <Bell size={11} /> : <BellOff size={11} />}
                <span>{thresholds.enabled ? 'Alertas Activas' : 'Alertas Desactivadas'}</span>
              </button>

              {/* Presets */}
              <button
                onClick={() =>
                  onUpdateThresholds({
                    aulas: 150,
                    invitados: 50,
                    admin: 100,
                    errors: 1,
                    enabled: true,
                  })
                }
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px]"
              >
                Preset Sensible (Bajo)
              </button>
              <button
                onClick={() =>
                  onUpdateThresholds({
                    aulas: 350,
                    invitados: 100,
                    admin: 220,
                    errors: 1,
                    enabled: true,
                  })
                }
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px]"
              >
                Preset Estándar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            {/* Threshold Aulas */}
            <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sky-400 font-semibold">Umbral Aulas (Estudiantes)</span>
                <span className="font-mono text-slate-200">{thresholds.aulas} B</span>
              </div>
              <input
                type="range"
                min="50"
                max="800"
                step="25"
                value={thresholds.aulas}
                onChange={(e) =>
                  onUpdateThresholds({ ...thresholds, aulas: Number(e.target.value) })
                }
                className="w-full accent-sky-500 cursor-pointer"
              />
              <div className="text-[10px] text-slate-500 font-mono mt-1">
                Actual: {latestPoint.aulas} B {breaches.aulas ? '⚠️ (Superado)' : '✓ (Normal)'}
              </div>
            </div>

            {/* Threshold Invitados */}
            <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
              <div className="flex justify-between items-center mb-1">
                <span className="text-amber-400 font-semibold">Umbral Wi-Fi Invitados</span>
                <span className="font-mono text-slate-200">{thresholds.invitados} B</span>
              </div>
              <input
                type="range"
                min="20"
                max="500"
                step="10"
                value={thresholds.invitados}
                onChange={(e) =>
                  onUpdateThresholds({ ...thresholds, invitados: Number(e.target.value) })
                }
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="text-[10px] text-slate-500 font-mono mt-1">
                Actual: {latestPoint.invitados} B {breaches.invitados ? '⚠️ (Superado)' : '✓ (Normal)'}
              </div>
            </div>

            {/* Threshold Admin */}
            <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
              <div className="flex justify-between items-center mb-1">
                <span className="text-emerald-400 font-semibold">Umbral Administración</span>
                <span className="font-mono text-slate-200">{thresholds.admin} B</span>
              </div>
              <input
                type="range"
                min="50"
                max="800"
                step="25"
                value={thresholds.admin}
                onChange={(e) =>
                  onUpdateThresholds({ ...thresholds, admin: Number(e.target.value) })
                }
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="text-[10px] text-slate-500 font-mono mt-1">
                Actual: {latestPoint.admin} B {breaches.admin ? '⚠️ (Superado)' : '✓ (Normal)'}
              </div>
            </div>

            {/* Threshold Errors / Drops */}
            <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
              <div className="flex justify-between items-center mb-1">
                <span className="text-rose-400 font-semibold">Umbral Errores / Drops</span>
                <span className="font-mono text-slate-200">{thresholds.errors} drops</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={thresholds.errors}
                onChange={(e) =>
                  onUpdateThresholds({ ...thresholds, errors: Number(e.target.value) })
                }
                className="w-full accent-rose-500 cursor-pointer"
              />
              <div className="text-[10px] text-slate-500 font-mono mt-1">
                Actual: {latestPoint.errors} drops {breaches.errors ? '⚠️ (Superado)' : '✓ (Normal)'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Threshold Breach Alert Banner (Visual Notification) */}
      {breaches.any && (
        <div className="px-4 py-2 bg-rose-950/80 border-b border-rose-800 text-rose-200 flex items-center justify-between text-xs font-mono animate-in fade-in">
          <div className="flex items-center gap-2">
            <Flame size={15} className="text-rose-400 animate-bounce" />
            <span className="font-bold text-white">¡ALERTA DE TRÁFICO EXCEDIDO!</span>
            <span className="text-rose-300">
              Los gráficos de Recharts han cambiado a color de alerta ({breaches.list.join(' · ')})
            </span>
          </div>
          <span className="text-[10px] bg-rose-900/60 px-2 py-0.5 rounded border border-rose-700">
            Umbrales Activos
          </span>
        </div>
      )}

      {/* KPI Cards Row (Highlighted if breached) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-950/60 border-b border-slate-800/80 shrink-0">
        <div
          className={`p-2.5 rounded-lg border transition-all ${
            breaches.aulas
              ? 'bg-rose-950/30 border-rose-600 shadow-md shadow-rose-950/50'
              : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>Tráfico Aulas (Estudiantes)</span>
            {breaches.aulas && (
              <span className="text-[9px] font-bold text-rose-400 uppercase font-mono">
                ⚠️ Umbral Excedido
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-base font-bold font-mono tabular-nums ${
                breaches.aulas ? 'text-rose-400' : 'text-sky-400'
              }`}
            >
              {latestPoint.aulas} B
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              / int (Límite: {thresholds.aulas} B)
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">192.168.10-30.0/24</div>
        </div>

        <div
          className={`p-2.5 rounded-lg border transition-all ${
            breaches.invitados
              ? 'bg-rose-950/30 border-rose-600 shadow-md shadow-rose-950/50'
              : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>Tráfico Wi-Fi Invitados</span>
            {breaches.invitados && (
              <span className="text-[9px] font-bold text-rose-400 uppercase font-mono">
                ⚠️ Umbral Excedido
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-base font-bold font-mono tabular-nums ${
                breaches.invitados ? 'text-rose-400' : 'text-amber-400'
              }`}
            >
              {latestPoint.invitados} B
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              / int (Límite: {thresholds.invitados} B)
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">172.16.50.0/24</div>
        </div>

        <div
          className={`p-2.5 rounded-lg border transition-all ${
            breaches.admin
              ? 'bg-rose-950/30 border-rose-600 shadow-md shadow-rose-950/50'
              : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>Tráfico Administración</span>
            {breaches.admin && (
              <span className="text-[9px] font-bold text-rose-400 uppercase font-mono">
                ⚠️ Umbral Excedido
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-base font-bold font-mono tabular-nums ${
                breaches.admin ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {latestPoint.admin} B
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              / int (Límite: {thresholds.admin} B)
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">192.168.100/200.0/24</div>
        </div>

        <div
          className={`p-2.5 rounded-lg border transition-all ${
            breaches.errors
              ? 'bg-rose-950/30 border-rose-600 shadow-md shadow-rose-950/50'
              : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>Tasa de Descarte y Error</span>
            {breaches.errors && (
              <span className="text-[9px] font-bold text-rose-400 uppercase font-mono">
                ⚠️ {latestPoint.errors} Drops
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-base font-bold font-mono tabular-nums ${
                breaches.errors || Number(subnetStats.errorRate) > 0
                  ? 'text-rose-400'
                  : 'text-emerald-400'
              }`}
            >
              {subnetStats.errorRate}%
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              ({subnetStats.totalErrors} descartes)
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            {routerMode === 'independent' ? 'Redes Aisladas (Trunk Down)' : 'Firewall ACLs'}
          </div>
        </div>
      </div>

      {/* Main Charts Area */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Chart 1: Real-time Timeline with Dynamic Threshold Colors and Reference Lines */}
          <div className="lg:col-span-2 p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col h-64">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
                <Activity size={14} className="text-sky-400" />
                Histórico Temporal de Tráfico por Segmento con Umbrales Dinámicos
              </span>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                {breaches.any ? (
                  <span className="text-rose-400 font-bold animate-pulse">● Alerta de Color Activa</span>
                ) : (
                  <span className="text-emerald-400 font-medium">● Flujo Nominal</span>
                )}
              </div>
            </div>

            <div className="flex-1 w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAulas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={aulasColor} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={aulasColor} stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorInvitados" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={invitadosColor} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={invitadosColor} stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorAdmin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={adminColor} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={adminColor} stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorErrors" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={errorsColor} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={errorsColor} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }}
                    formatter={(val) => <span className="text-slate-300 font-sans">{val}</span>}
                  />

                  {/* Reference Lines for Defined Subnet Thresholds */}
                  {thresholds.enabled && (
                    <>
                      <ReferenceLine
                        y={thresholds.aulas}
                        stroke="#0284c7"
                        strokeDasharray="4 4"
                        label={{ value: `Umbral Aulas (${thresholds.aulas}B)`, fill: '#38bdf8', fontSize: 9 }}
                      />
                      <ReferenceLine
                        y={thresholds.invitados}
                        stroke="#f59e0b"
                        strokeDasharray="4 4"
                        label={{ value: `Umbral Invitados (${thresholds.invitados}B)`, fill: '#fbbf24', fontSize: 9 }}
                      />
                      <ReferenceLine
                        y={thresholds.admin}
                        stroke="#10b981"
                        strokeDasharray="4 4"
                        label={{ value: `Umbral Admin (${thresholds.admin}B)`, fill: '#34d399', fontSize: 9 }}
                      />
                    </>
                  )}

                  <Area
                    type="monotone"
                    dataKey="aulas"
                    name={breaches.aulas ? '⚠️ Aulas (Umbral Superado)' : 'Aulas'}
                    stroke={aulasColor}
                    strokeWidth={breaches.aulas ? 2.5 : 1.5}
                    fillOpacity={1}
                    fill="url(#colorAulas)"
                  />
                  <Area
                    type="monotone"
                    dataKey="invitados"
                    name={breaches.invitados ? '⚠️ Wi-Fi Invitados (Umbral Superado)' : 'Wi-Fi Invitados'}
                    stroke={invitadosColor}
                    strokeWidth={breaches.invitados ? 2.5 : 1.5}
                    fillOpacity={1}
                    fill="url(#colorInvitados)"
                  />
                  <Area
                    type="monotone"
                    dataKey="admin"
                    name={breaches.admin ? '⚠️ Administración (Umbral Superado)' : 'Administración'}
                    stroke={adminColor}
                    strokeWidth={breaches.admin ? 2.5 : 1.5}
                    fillOpacity={1}
                    fill="url(#colorAdmin)"
                  />
                  <Area
                    type="monotone"
                    dataKey="errors"
                    name={breaches.errors ? '⚠️ Descartes/Drops (Alerta)' : 'Descartes / Drops'}
                    stroke={errorsColor}
                    strokeWidth={breaches.errors ? 2.5 : 1.5}
                    fillOpacity={1}
                    fill="url(#colorErrors)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Protocol Distribution */}
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col h-64">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-200 text-xs">Distribución por Protocolo</span>
              <span className="text-[10px] text-slate-500 font-mono">Capa 3 / 4 / 7</span>
            </div>

            <div className="flex-1 w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={protocolDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={68}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {protocolDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '10px' }}
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                    formatter={(val) => <span className="text-slate-300 font-sans">{val}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Chart 3 & Router Interconnection Mode Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Subnet Traffic Comparison BarChart with Dynamic Alert Colors */}
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col h-56">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-slate-200 text-xs">
                Volumen Acumulado por Subred (Cambio de color por Alerta)
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Total histórico</span>
            </div>

            <div className="flex-1 w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subnetComparisonData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <Bar dataKey="paquetes" radius={[4, 4, 0, 0]}>
                    {subnetComparisonData.map((entry, index) => (
                      <Cell key={`bar-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Router Interconnection Mode Card */}
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
                  <Radio size={14} className="text-indigo-400" />
                  Arquitectura de Enrutamiento L3
                </span>
                <button
                  onClick={onToggleRouterMode}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono transition-colors ${
                    routerMode === 'interconnected'
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      : 'bg-amber-600 hover:bg-amber-500 text-white'
                  }`}
                >
                  {routerMode === 'interconnected'
                    ? 'Modo: Troncal Conectado'
                    : 'Modo: Redes Independientes'}
                </button>
              </div>

              <p className="text-slate-400 text-xs leading-relaxed">
                {routerMode === 'interconnected' ? (
                  <span>
                    <strong className="text-indigo-300">Routers Interconectados:</strong> El enlace troncal de 10 Gbps (
                    <span className="font-mono text-slate-300">10.0.0.0/30</span>) entre el Router Académico y el Router de Administración
                    está <span className="text-emerald-400 font-semibold">ACTIVO</span>. Los paquetes pueden fluir entre Aulas y Servidores Campus.
                  </span>
                ) : (
                  <span>
                    <strong className="text-amber-300">Redes 100% Independientes:</strong> El enlace troncal entre ambos routers está{' '}
                    <span className="text-rose-400 font-semibold">DESCONECTADO (DOWN)</span>. La red de Aulas y la red de Administración
                    operan como islas aisladas. Cualquier intento de tráfico inter-router será descartado como{' '}
                    <span className="font-mono text-rose-300">Network Unreachable</span>.
                  </span>
                )}
              </p>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">Estado del Troncal:</span>
              <span
                className={`font-mono font-bold ${
                  routerMode === 'interconnected' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {routerMode === 'interconnected' ? 'UP · 10.0.0.1 <-> 10.0.0.2' : 'DOWN · Sin Conectividad Inter-Red'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 4: Live Physical Latency & Dynamic Queue Delay Monitor */}
        <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-amber-400" />
              <span className="font-semibold text-slate-100 text-xs">
                Monitor de Latencia Física de Enlaces y Tiempo de Viaje Dinámico
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 text-[10px] font-mono">
                Fluctuación Activa
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              {breaches.any ? (
                <span className="text-rose-400 font-semibold animate-pulse flex items-center gap-1">
                  <AlertTriangle size={12} /> Bufferbloat / Encolamiento por congestión en subred
                </span>
              ) : (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Tiempos de propagación nominales
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {/* Aulas LAN */}
            <div className={`p-2.5 rounded-lg border transition-all ${
              breaches.aulas ? 'bg-rose-950/30 border-rose-600' : 'bg-slate-950 border-slate-800'
            }`}>
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span className="font-semibold text-slate-200">Aulas (Ethernet LAN)</span>
                <span className="text-[10px] font-mono text-sky-400">Cat6 1Gbps</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className={`text-base font-bold font-mono ${breaches.aulas ? 'text-rose-400' : 'text-sky-400'}`}>
                  {latencySummary.aulasLat} ms
                </span>
                <span className="text-[10px] text-slate-500 font-mono">(Base: 1.0 ms)</span>
              </div>
              <div className="text-[10px] mt-1 font-mono text-slate-400">
                {breaches.aulas ? '⚠️ Encolamiento por saturación' : '● Flujo rápido sin cola'}
              </div>
            </div>

            {/* Wi-Fi Invitados */}
            <div className={`p-2.5 rounded-lg border transition-all ${
              breaches.invitados ? 'bg-rose-950/30 border-rose-600' : 'bg-slate-950 border-slate-800'
            }`}>
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span className="font-semibold text-slate-200">Wi-Fi Invitados (RF)</span>
                <span className="text-[10px] font-mono text-amber-400">802.11ac</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className={`text-base font-bold font-mono ${breaches.invitados ? 'text-rose-400' : 'text-amber-400'}`}>
                  {latencySummary.guestLat} ms
                </span>
                <span className="text-[10px] text-slate-500 font-mono">(Base: 4.0 ms)</span>
              </div>
              <div className="text-[10px] mt-1 font-mono text-slate-400">
                {breaches.invitados ? '⚠️ Contención y cola en AP' : '● Jitter RF moderado'}
              </div>
            </div>

            {/* Troncal 10G */}
            <div className="p-2.5 rounded-lg border bg-slate-950 border-slate-800">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span className="font-semibold text-slate-200">Troncal Routers (10G)</span>
                <span className="text-[10px] font-mono text-indigo-400">10.0.0.0/30</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className={`text-base font-bold font-mono ${routerMode === 'independent' ? 'text-slate-500' : 'text-indigo-400'}`}>
                  {routerMode === 'independent' ? 'DESCONECTADO' : `${latencySummary.trunkLat} ms`}
                </span>
                {routerMode === 'interconnected' && <span className="text-[10px] text-slate-500 font-mono">(Base: 3.0 ms)</span>}
              </div>
              <div className="text-[10px] mt-1 font-mono text-slate-400">
                {routerMode === 'independent' ? '✕ Tráfico aislado inter-router' : '● Fibra óptica troncal activa'}
              </div>
            </div>

            {/* WAN Externa */}
            <div className="p-2.5 rounded-lg border bg-slate-950 border-slate-800">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span className="font-semibold text-slate-200">Tránsito WAN Externa</span>
                <span className="text-[10px] font-mono text-purple-400">DNS 8.8.8.8</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-base font-bold font-mono text-purple-400">
                  {latencySummary.wanLat} ms
                </span>
                <span className="text-[10px] text-slate-500 font-mono">(Base: 25.0 ms)</span>
              </div>
              <div className="text-[10px] mt-1 font-mono text-slate-400">
                ● Retardo WAN con jitter ISP
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
