import React, { useState, useEffect, useRef } from 'react';
import {
  NetworkNode,
  NetworkLink,
  SimulatedPacket,
  LabMission,
  RouterInterconnectionMode,
  SubnetThresholds,
  ProtocolType,
  FirewallRule,
  ArpTableEntry,
} from './types/network';
import { INITIAL_NODES, INITIAL_LINKS, LAB_MISSIONS } from './data/topologyData';
import {
  resolveTarget,
  createPingSimulation,
  createArpResolution,
  createDnsSimulation,
  createHttpSimulation,
  createTracerouteSimulation,
  isSameSubnet,
  isValidIpv4,
  ipToInt,
  getZoneVlan,
  portTowards,
  updateSwitchMacTables,
  calculateLinkDynamicLatency,
} from './services/networkEngine';
import { TopNav } from './components/TopNav';
import { NetworkSummaryBar } from './components/NetworkSummaryBar';
import { NetworkTopologyCanvas } from './components/NetworkTopologyCanvas';
import { TerminalConsole } from './components/TerminalConsole';
import { WiresharkInspector } from './components/WiresharkInspector';
import { DeviceDetailModal } from './components/DeviceDetailModal';
import { LabMissionsModal } from './components/LabMissionsModal';
import { NetworkTelemetryDashboard, TrafficTimePoint } from './components/NetworkTelemetryDashboard';
import { SubnetCalculatorModal } from './components/SubnetCalculatorModal';
import { PacketBuilderModal } from './components/PacketBuilderModal';
import { LabReportModal } from './components/LabReportModal';
import { RouterAclModal } from './components/RouterAclModal';
import { soundFx } from './utils/audioEffects';
import { Terminal, Network, ShieldCheck, Sparkles, AlertCircle, BarChart3, ExternalLink } from 'lucide-react';

const TRUNK_LINK_ID = 'link-trunk-routers';
const LOGO_URL = `${import.meta.env.BASE_URL}assets/aistudio/icono_81a3db5b.png`;

// Add or refresh an ARP cache entry
const learnArp = (table: ArpTableEntry[] = [], ip: string, mac: string): ArpTableEntry[] => {
  const entry: ArpTableEntry = { ip, mac, interfaceName: 'eth0', type: 'dynamic', updatedAt: Date.now() };
  return table.some((a) => a.ip === ip) ? table.map((a) => (a.ip === ip ? { ...a, mac, updatedAt: entry.updatedAt } : a)) : [...table, entry];
};

export default function App() {
  // Network Topo State
  const [nodes, setNodes] = useState<NetworkNode[]>(INITIAL_NODES);
  const [links, setLinks] = useState<NetworkLink[]>(INITIAL_LINKS);
  const [thresholds, setThresholds] = useState<SubnetThresholds>({
    aulas: 350,
    invitados: 100,
    admin: 220,
    errors: 1,
    enabled: true,
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string>('pc-101');
  const [detailModalNode, setDetailModalNode] = useState<NetworkNode | null>(null);

  // Router mode is not separate state: it is the status of the inter-router trunk link
  const routerMode: RouterInterconnectionMode =
    links.find((l) => l.id === TRUNK_LINK_ID)?.status === 'down' ? 'independent' : 'interconnected';

  // Simulation Packets & Execution
  const [activePackets, setActivePackets] = useState<SimulatedPacket[]>([]);
  const [packetHistory, setPacketHistory] = useState<SimulatedPacket[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(1);
  const [showLabels, setShowLabels] = useState<boolean>(true);

  // Refs read by the timers (they must not capture stale state)
  const activeRef = useRef<SimulatedPacket[]>([]);
  const nodesRef = useRef(nodes);
  const linksRef = useRef(links);
  const speedRef = useRef(speed);
  const thresholdsRef = useRef(thresholds);
  const dropCounterRef = useRef(0);
  nodesRef.current = nodes;
  linksRef.current = links;
  speedRef.current = speed;
  thresholdsRef.current = thresholds;

  // UI Panels & Labs
  const [bottomTab, setBottomTab] = useState<'terminal' | 'wireshark' | 'telemetry'>('terminal');
  const [isLabsModalOpen, setIsLabsModalOpen] = useState<boolean>(false);
  const [completedMissionIds, setCompletedMissionIds] = useState<string[]>([]);
  const [highlightedPacket, setHighlightedPacket] = useState<SimulatedPacket | null>(null);

  // Educational Modals & Audio state
  const [isSubnetModalOpen, setIsSubnetModalOpen] = useState<boolean>(false);
  const [isPacketBuilderOpen, setIsPacketBuilderOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isAclModalOpen, setIsAclModalOpen] = useState<boolean>(false);
  const [selectedAclRouterId, setSelectedAclRouterId] = useState<string>('r-academico');
  const [isMuted, setIsMuted] = useState<boolean>(soundFx.getMuted());

  const handleToggleMute = () => {
    const nextMuted = soundFx.toggleMute();
    setIsMuted(nextMuted);
  };

  // Telemetry time series for recharts
  const [timeSeriesData, setTimeSeriesData] = useState<TrafficTimePoint[]>([
    { time: '00:01', aulas: 120, invitados: 40, admin: 80, errors: 0 },
    { time: '00:03', aulas: 260, invitados: 90, admin: 140, errors: 0 },
    { time: '00:05', aulas: 180, invitados: 110, admin: 210, errors: 0 },
    { time: '00:07', aulas: 340, invitados: 60, admin: 180, errors: 1 },
    { time: '00:09', aulas: 420, invitados: 130, admin: 290, errors: 0 },
    { time: '00:11', aulas: 310, invitados: 150, admin: 240, errors: 2 },
  ]);

  // Terminal Console Logs
  const [terminalLogs, setTerminalLogs] = useState<
    { id: string; text: string; type: 'cmd' | 'output' | 'error' | 'success' | 'info' }[]
  >([
    {
      id: 'welcome-1',
      text: 'Academia Networking Lab Terminal · Sistema listo.',
      type: 'info',
    },
    {
      id: 'welcome-2',
      text: 'Prueba: ping 192.168.10.12 o haz clic en "Ver Laboratorios" para misiones guiadas.',
      type: 'output',
    },
  ]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];

  // Helper to append log to terminal
  const addTerminalLog = (
    text: string,
    type: 'cmd' | 'output' | 'error' | 'success' | 'info' = 'output'
  ) => {
    setTerminalLogs((prev) => [
      ...prev,
      { id: `log-${Date.now()}-${Math.random()}`, text, type },
    ]);
  };

  // ---- Packet queue (every change goes through activeRef so timers never overwrite each other) ----
  const updateActive = (fn: (prev: SimulatedPacket[]) => SimulatedPacket[]) => {
    activeRef.current = fn(activeRef.current);
    setActivePackets(activeRef.current);
  };

  const markInHistory = (updates: Map<string, SimulatedPacket['status']>) => {
    if (updates.size === 0) return;
    setPacketHistory((prev) => prev.map((p) => (updates.has(p.id) ? { ...p, status: updates.get(p.id)! } : p)));
  };

  const enqueuePacket = (pkt: SimulatedPacket, delayMs = 0) => {
    const add = () => {
      if (pkt.steps.length === 0) {
        // Nothing to animate (e.g. a packet to itself, or no physical path at all)
        const status = pkt.destNodeId === pkt.sourceNodeId ? 'delivered' : 'dropped';
        setPacketHistory((prev) => [{ ...pkt, status }, ...prev]);
        return;
      }
      setPacketHistory((prev) => [pkt, ...prev]);
      updateActive((prev) => [...prev, pkt]);
    };
    if (delayMs > 0) setTimeout(add, delayMs);
    else add();
  };

  const resetSimulation = () => updateActive(() => []);

  // Advance every packet in flight. `increment` = progress per tick, or 'step' to finish the current hop.
  const advancePackets = (increment: number | 'step') => {
    const currentNodes = nodesRef.current;
    const currentLinks = linksRef.current;
    const next: SimulatedPacket[] = [];
    const finished = new Map<string, SimulatedPacket['status']>();
    const droppedAt: string[] = [];
    const learned: { switchId: string; mac: string; port: string; vlan: number }[] = [];
    const arpReplies: SimulatedPacket[] = [];
    let lastFinished: SimulatedPacket | null = null;
    let hopped = false;

    for (const pkt of activeRef.current) {
      const currentStep = pkt.steps[pkt.currentStepIndex];
      if (!currentStep) continue;

      // Travel time follows link latency: 1ms LAN is swift, congested WAN visibly slower
      const stepLatency = currentStep.stepLatencyMs || 2.0;
      const latencyFactor = Math.max(0.45, Math.min(3.5, stepLatency / 3.2));
      const newProgress = increment === 'step' ? 1 : pkt.progress + (0.055 / latencyFactor) * increment;

      if (newProgress < 1.0) {
        next.push({ ...pkt, progress: newProgress });
        continue;
      }

      if (currentStep.isDropped) {
        finished.set(pkt.id, 'dropped');
        droppedAt.push(currentStep.toNodeId);
        lastFinished = { ...pkt, status: 'dropped' };
        continue;
      }

      // MAC learning: the switch records the source MAC of the frame on the ingress port
      const toNode = currentNodes.find((n) => n.id === currentStep.toNodeId);
      const fromNode = currentNodes.find((n) => n.id === currentStep.fromNodeId);
      if (toNode?.type === 'switch' && fromNode) {
        const port = portTowards(currentLinks, toNode.id, fromNode.id);
        const routedBefore = pkt.steps.slice(0, pkt.currentStepIndex).some((s) => currentNodes.find((n) => n.id === s.fromNodeId)?.type === 'router');
        if (port && fromNode.type === 'router') {
          const routerPort = portTowards(currentLinks, fromNode.id, toNode.id);
          const mac = fromNode.interfaces.find((i) => i.name === routerPort)?.mac || fromNode.primaryMac;
          learned.push({ switchId: toNode.id, mac, port, vlan: getZoneVlan(toNode.zone) ?? pkt.layer2.vlanId ?? 1 });
        } else if (port && !routedBefore) {
          learned.push({ switchId: toNode.id, mac: pkt.layer2.sourceMac, port, vlan: pkt.layer2.vlanId ?? 1 });
        }
      }

      if (pkt.currentStepIndex < pkt.steps.length - 1) {
        hopped = true;
        next.push({ ...pkt, currentStepIndex: pkt.currentStepIndex + 1, progress: 0 });
      } else {
        finished.set(pkt.id, 'delivered');
        lastFinished = { ...pkt, status: 'delivered' };
        if (pkt.protocol === 'ARP' && pkt.layer7.payload?.opcode === 'Reply (2)') arpReplies.push(pkt);
      }
    }

    updateActive(() => next);
    markInHistory(finished);
    if (lastFinished) setHighlightedPacket(lastFinished);

    if (droppedAt.length) {
      dropCounterRef.current += droppedAt.length;
      soundFx.playPacketDropped();
    } else if ([...finished.values()].includes('delivered')) {
      soundFx.playPacketDelivered();
    } else if (hopped) {
      soundFx.playPacketHop();
    }

    if (droppedAt.length || learned.length || arpReplies.length) {
      setNodes((prevNodes) =>
        prevNodes.map((n) => {
          let updated = n;
          const drops = droppedAt.filter((id) => id === n.id).length;
          if (drops) updated = { ...updated, stats: { ...updated.stats, packetsDropped: updated.stats.packetsDropped + drops } };

          const mine = learned.filter((l) => l.switchId === n.id);
          if (mine.length) {
            let table = [...(updated.macTable || [])];
            for (const l of mine) {
              const entry = { mac: l.mac, port: l.port, vlan: l.vlan, ageSeconds: 0, type: 'DYNAMIC' as const };
              table = table.some((m) => m.mac === l.mac) ? table.map((m) => (m.mac === l.mac ? { ...m, ...entry } : m)) : [...table, entry];
            }
            updated = { ...updated, macTable: table };
          }

          // ARP Reply delivered: the requester learns the responder and vice versa
          for (const rep of arpReplies) {
            const p = rep.layer7.payload!;
            const owns = (ip: string) => updated.primaryIp === ip || updated.interfaces.some((i) => i.ip === ip);
            if (owns(p.targetIp)) updated = { ...updated, arpTable: learnArp(updated.arpTable, p.senderIp, p.senderMac) };
            if (owns(p.senderIp)) updated = { ...updated, arpTable: learnArp(updated.arpTable, p.targetIp, p.targetMac) };
          }
          return updated;
        })
      );
    }
  };

  // Main Animation Tick for packet flow
  const hasActivePackets = activePackets.length > 0;
  useEffect(() => {
    if (!isPlaying || !hasActivePackets) return;
    const interval = setInterval(() => advancePackets(speedRef.current), 40);
    return () => clearInterval(interval);
    // advancePackets only reads refs and stable setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, hasActivePackets]);

  // Real-time telemetry sampler for Recharts (every 2.5 seconds). Reads refs so the timer is not
  // restarted on every animation frame (which previously stopped it while packets were moving).
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const timeLabel = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const currentNodes = nodesRef.current;
      const th = thresholdsRef.current;

      // Calculate recent packet activity
      let aulasTraffic = 0;
      let invitadosTraffic = 0;
      let adminTraffic = 0;
      const recentErrors = dropCounterRef.current;
      dropCounterRef.current = 0;

      activeRef.current.forEach((p) => {
        const src = currentNodes.find((n) => n.id === p.sourceNodeId);
        if (src) {
          if (src.zone === 'aula1' || src.zone === 'aula2' || src.zone === 'aula3') aulasTraffic += p.sizeBytes;
          else if (src.zone === 'wifi-guest') invitadosTraffic += p.sizeBytes;
          else if (src.zone === 'admin-zone1' || src.zone === 'admin-zone2') adminTraffic += p.sizeBytes;
        }
      });

      // Ambient baseline activity for realistic data visualization if idle
      if (aulasTraffic === 0) aulasTraffic = Math.floor(60 + Math.random() * 80);
      if (invitadosTraffic === 0) invitadosTraffic = Math.floor(20 + Math.random() * 50);
      if (adminTraffic === 0) adminTraffic = Math.floor(40 + Math.random() * 70);

      // Update dynamic fluctuating link latencies based on live subnet load
      setLinks((prevLinks) =>
        prevLinks.map((link) => {
          const fromNode = currentNodes.find((n) => n.id === link.fromNodeId);
          const toNode = currentNodes.find((n) => n.id === link.toNodeId);

          let linkTraffic = aulasTraffic;
          let threshold = th.aulas;

          const isGuestLink = fromNode?.zone === 'wifi-guest' || toNode?.zone === 'wifi-guest';
          const isAdminLink =
            fromNode?.zone === 'admin-zone1' ||
            fromNode?.zone === 'admin-zone2' ||
            toNode?.zone === 'admin-zone1' ||
            toNode?.zone === 'admin-zone2' ||
            fromNode?.zone === 'wan' ||
            toNode?.zone === 'wan';

          if (link.id === TRUNK_LINK_ID) {
            linkTraffic = aulasTraffic + adminTraffic + invitadosTraffic;
            threshold = th.aulas + th.admin;
          } else if (isGuestLink) {
            linkTraffic = invitadosTraffic;
            threshold = th.invitados;
          } else if (isAdminLink) {
            linkTraffic = adminTraffic;
            threshold = th.admin;
          }

          const { currentLatency, jitter } = calculateLinkDynamicLatency(link, linkTraffic, threshold);
          return {
            ...link,
            currentLatency,
            jitter,
          };
        })
      );

      setTimeSeriesData((prev) => {
        const next = [
          ...prev,
          {
            time: timeLabel,
            aulas: aulasTraffic,
            invitados: invitadosTraffic,
            admin: adminTraffic,
            errors: recentErrors,
          },
        ];
        if (next.length > 20) return next.slice(next.length - 20);
        return next;
      });
    }, 2500);

    return () => clearInterval(timer);
  }, []);

  // Toggle individual link status (Link Cut / Cable Fault simulation)
  const handleToggleLink = (linkId: string) => {
    const link = links.find((l) => l.id === linkId);
    if (!link) return;
    const nextStatus = link.status === 'down' ? 'active' : 'down';
    setLinks((prevLinks) => prevLinks.map((l) => (l.id === linkId ? { ...l, status: nextStatus } : l)));

    if (linkId === TRUNK_LINK_ID) {
      addTerminalLog(
        nextStatus === 'active'
          ? '[TOPOLOGÍA] Enlace Troncal 10G CONECTADO (UP): Routers interconectados (10.0.0.1 <-> 10.0.0.2). Enrutamiento L3 habilitado entre Aulas y Administración.'
          : '[TOPOLOGÍA] Enlace Troncal DESCONECTADO (DOWN): Redes 100% Independientes. Router Académico y Router Administración operan aislados.',
        nextStatus === 'active' ? 'success' : 'error'
      );
    } else {
      addTerminalLog(
        `[FALLO FÍSICO / ENLACE] Enlace ${link.id} (${link.fromPort} ↔ ${link.toPort}): estado cambiado a ${nextStatus.toUpperCase()}. ${
          nextStatus === 'down'
            ? '⚠️ Cable desconectado. Las tramas en este tramo se descartarán.'
            : '✅ Enlace físico restablecido (LINK UP).'
        }`,
        nextStatus === 'active' ? 'success' : 'error'
      );
    }
    if (nextStatus === 'down') soundFx.playPacketDropped();
    else soundFx.playPacketDelivered();
  };

  // Toggle between Interconnected Routers (Trunk UP) and Independent Networks (Trunk DOWN)
  const handleToggleRouterMode = () => handleToggleLink(TRUNK_LINK_ID);

  // Burst traffic generator for live demonstrations
  const handleGenerateBurst = (type: 'normal' | 'guest_attack' | 'web_surge') => {
    if (type === 'normal') {
      addTerminalLog('[BURST TELEMETRÍA] Generando ráfaga de tráfico docente entre Aulas 1 y 2...', 'info');
      const pc1 = nodes.find((n) => n.id === 'pc-101') || nodes[0];
      const pc2 = nodes.find((n) => n.id === 'pc-201') || nodes[0];
      executeCommand('ping 192.168.20.11', pc1);
      setTimeout(() => executeCommand('ping 192.168.10.11', pc2), 800);
    } else if (type === 'guest_attack') {
      addTerminalLog('[BURST SEGURIDAD] Simulando intento de intrusión desde Wi-Fi Invitados hacia BD Secretaría...', 'error');
      const laptopGuest = nodes.find((n) => n.id === 'laptop-guest') || nodes[0];
      executeCommand('ping 192.168.100.20', laptopGuest);
    } else if (type === 'web_surge') {
      addTerminalLog('[BURST WEB] Generando oleada de consultas DNS y peticiones HTTP al Campus Web...', 'success');
      const pc3 = nodes.find((n) => n.id === 'pc-301') || nodes[0];
      executeCommand('curl http://campus.academia.edu', pc3);
    }
  };

  // Handle IEEE 802.1Q port VLAN assignment change. Returns false if the change is not valid.
  const handlePortVlanChange = (switchId: string, portName: string, newVlanId: number): boolean => {
    const sw = nodes.find((n) => n.id === switchId);
    const port = sw?.interfaces.find((i) => i.name === portName);
    if (!sw || !port) {
      addTerminalLog(`[VLAN 802.1Q] El puerto "${portName}" no existe en ${sw?.name || switchId}. Usa "show vlan" para ver los puertos.`, 'error');
      return false;
    }
    if (port.portMode === 'trunk') {
      addTerminalLog(`[VLAN 802.1Q] ${portName} es un puerto troncal (transporta varias VLAN etiquetadas); solo se puede cambiar la VLAN de los puertos de acceso.`, 'error');
      return false;
    }
    if (!Number.isInteger(newVlanId) || newVlanId < 1 || newVlanId > 4094) {
      addTerminalLog('[VLAN 802.1Q] El VLAN ID debe ser un número entre 1 y 4094.', 'error');
      return false;
    }
    setNodes((prevNodes) =>
      prevNodes.map((n) => {
        if (n.id !== switchId) return n;
        const nextInterfaces = n.interfaces.map((i) =>
          i.name === portName ? { ...i, vlanId: newVlanId } : i
        );
        const nextMacTable = (n.macTable || []).map((m) =>
          m.port === portName ? { ...m, vlan: newVlanId } : m
        );
        return { ...n, interfaces: nextInterfaces, macTable: nextMacTable };
      })
    );
    addTerminalLog(
      `[VLAN 802.1Q] Switch ${sw.name}: Puerto ${portName} asignado a VLAN ${newVlanId}. Dominio de difusión y segmentación L2 actualizados.`,
      'success'
    );
    return true;
  };

  const maskOf = (node: NetworkNode) =>
    node.interfaces.find((i) => i.ip && i.ip === node.primaryIp)?.subnetMask || '255.255.255.0';

  // Command Execution Engine
  const executeCommand = (rawCommand: string, node: NetworkNode) => {
    const trimmed = rawCommand.trim();
    if (!trimmed) return;

    addTerminalLog(`${node.name}:~$ ${trimmed}`, 'cmd');

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Commands that originate IP traffic need an IP address
    const requireIp = () => {
      if (node.primaryIp) return true;
      addTerminalLog(
        `${node.name} es un ${node.type === 'switch' ? 'switch L2' : 'dispositivo'} sin dirección IP de gestión: no puede originar "${cmd}". Selecciona un PC, servidor o router.`,
        'error'
      );
      return false;
    };

    // 1. HELP
    if (cmd === 'help') {
      addTerminalLog(
        `Comandos Disponibles en el Simulador:
  ping [-c N] [-t TTL] <ip|host>  Envía paquetes ICMP Echo Request y calcula RTT.
  traceroute <ip|host>   Traza los routers del camino mostrando cada salto.
  arp -a                 Muestra la tabla de resolución ARP (IP a MAC).
  arp -d                 Limpia la caché ARP del equipo para forzar broadcast.
  ipconfig / ifconfig    Muestra IPs, máscaras, gateways y direcciones MAC.
  curl <url>             Petición HTTP (ej: curl http://campus.academia.edu, curl 192.168.100.20:1521).
  nslookup <dominio>     Consulta el servidor DNS configurado en el equipo.
  route print / netstat  Muestra la tabla de enrutamiento local o del router.
  mac-table [sw]         Muestra la tabla CAM con VLAN IDs (IEEE 802.1Q).
  show vlan / vlan list  Muestra la configuración de puertos y VLANs del switch.
  vlan set <port> <id>   Asigna un puerto a una VLAN (ej: vlan set port3 99).
  acl / firewall         Abre el editor de ACLs y muestra reglas de filtrado router.
  export / backup        Descarga la topología de red en archivo JSON.
  web / about            Enlace al sitio web oficial (unfantasmaenelsistema.com).
  clear                  Limpia los textos de la terminal.`,
        'info'
      );
      return;
    }

    // 1.02 ACL / FIREWALL / ACCESS-LIST
    if (cmd === 'acl' || cmd === 'firewall' || cmd === 'access-list' || cmd === 'access-lists') {
      const targetRouter = node.type === 'router' ? node : nodes.find((n) => n.id === 'r-academico');
      const rName = targetRouter ? targetRouter.name : 'Router Académico';
      const rRules = targetRouter?.firewallRules || [];

      let logText = `🛡️ [ACCESS CONTROL LISTS - ${rName}]\n`;
      if (rRules.length === 0) {
        logText += `No hay reglas ACL configuradas. Tráfico permitido por defecto.`;
      } else {
        rRules.forEach((r) => {
          logText += `  Sec ${r.sequence || 10}: [${r.enabled ? 'ACTIVA' : 'INACTIVA'}] ${r.action} ${r.protocol} ${r.sourceSubnet} -> ${r.destSubnet}${r.destPort && r.destPort !== 'any' ? ` eq ${r.destPort}` : ''} ${r.interfaceName && r.interfaceName !== 'any' ? `[${r.interfaceName} ${r.direction || 'IN'}] ` : ''}(${r.description})\n`;
        });
        logText += `  (Sin coincidencia: el simulador PERMITE el tráfico)\n`;
      }
      logText += `\nAbriendo editor interactivo de ACLs...`;
      addTerminalLog(logText, 'info');
      handleOpenAclEditor(targetRouter?.id);
      return;
    }

    // 1.05 EXPORT JSON
    if (cmd === 'export' || cmd === 'backup') {
      handleExportLab();
      return;
    }

    // 1.1 WEB / ABOUT
    if (cmd === 'web' || cmd === 'about' || cmd === 'autor' || cmd === 'unfantasmaenelsistema') {
      addTerminalLog(
        `🌐 [SITIO WEB OFICIAL] Un Fantasma en el Sistema\nURL: https://www.unfantasmaenelsistema.com/\nArtículos, tutoriales y laboratorios de ciberseguridad, redes, hacking ético y sistemas.`,
        'success'
      );
      return;
    }

    // 2. CLEAR
    if (cmd === 'clear') {
      setTerminalLogs([]);
      return;
    }

    // 3. IPCONFIG / IFCONFIG
    if (cmd === 'ipconfig' || cmd === 'ifconfig') {
      let output = `Configuración de Red de ${node.name} (${node.label}):\n`;
      node.interfaces.forEach((iface) => {
        output += `  Adaptador ${iface.name}:
      Dirección física (MAC) ... : ${iface.mac}
      Dirección IPv4 ........... : ${iface.ip || 'No asignada (L2/Bridge)'}
      Máscara de subred ........ : ${iface.subnetMask || 'N/A'}
      Puerta de enlace (Gateway) : ${iface.gateway || node.gateway || 'N/A'}
      Modo Puerto IEEE 802.1Q .. : ${iface.portMode ? iface.portMode.toUpperCase() : 'N/A'}${iface.vlanId ? ` (VLAN ${iface.vlanId})` : ''}\n`;
      });
      if (node.dnsServer) {
        output += `  Servidor DNS preferido ... : ${node.dnsServer}\n`;
      }
      addTerminalLog(output, 'output');
      return;
    }

    // 4. ARP
    if (cmd === 'arp') {
      if (args[0] === '-a') {
        if (!node.arpTable || node.arpTable.length === 0) {
          addTerminalLog('No se encontraron entradas ARP en caché para esta interfaz.', 'output');
        } else {
          let output = `Interfaz: ${node.primaryIp || 'eth0'} --- Tabla ARP Dinámica:\n  Dirección Internet      Dirección Física      Tipo\n`;
          node.arpTable.forEach((entry) => {
            output += `  ${entry.ip.padEnd(22)}  ${entry.mac.padEnd(20)}  ${entry.type}\n`;
          });
          addTerminalLog(output, 'output');
        }
        return;
      }
      if (args[0] === '-d') {
        setNodes((prev) =>
          prev.map((n) => (n.id === node.id ? { ...n, arpTable: [] } : n))
        );
        addTerminalLog('Entradas de la caché ARP eliminadas correctamente.', 'success');
        return;
      }
      addTerminalLog('Uso: arp -a (ver tabla) | arp -d (limpiar caché)', 'output');
      return;
    }

    // 5. ROUTE PRINT / NETSTAT
    if (cmd === 'route' || cmd === 'netstat') {
      let output = '';
      if (node.routingTable && node.routingTable.length > 0) {
        output = `Tabla de Rutas IPv4 de ${node.name}:\n  Destino de Red       Máscara          Puerta de Enlace  Interfaz  Métrica\n`;
        node.routingTable.forEach((r) => {
          output += `  ${r.destination.padEnd(20)} ${r.mask.padEnd(16)} ${r.gateway.padEnd(17)} ${r.interfaceName.padEnd(9)} ${r.metric}\n`;
        });
      } else if (node.primaryIp) {
        const mask = maskOf(node);
        const netInt = (ipToInt(node.primaryIp) & ipToInt(mask)) >>> 0;
        const network = [netInt >>> 24, (netInt >>> 16) & 255, (netInt >>> 8) & 255, netInt & 255].join('.');
        const iface = node.interfaces[0]?.name || 'eth0';
        output = `Rutas Activas del Host:\n  Destino de Red   Máscara          Puerta de Enlace  Interfaz  Métrica\n`;
        if (node.gateway) output += `  ${'0.0.0.0'.padEnd(16)} ${'0.0.0.0'.padEnd(16)} ${node.gateway.padEnd(17)} ${iface.padEnd(9)} 1\n`;
        output += `  ${network.padEnd(16)} ${mask.padEnd(16)} ${'Enlace local'.padEnd(17)} ${iface.padEnd(9)} 0`;
      } else {
        output = `${node.name} trabaja en Capa 2 y no tiene tabla de rutas IP.`;
      }
      addTerminalLog(output, 'output');
      return;
    }

    // 6. MAC-TABLE (Switches with IEEE 802.1Q VLAN IDs)
    if (
      cmd === 'mac-table' ||
      cmd === 'show-mac' ||
      cmd === 'show-cam' ||
      (cmd === 'show' && (args[0] === 'mac-address-table' || args[0] === 'mac' || args[0] === 'cam'))
    ) {
      let targetSwitch: NetworkNode | undefined = undefined;
      const swArg = cmd === 'show' ? args[1] : args[0];

      if (node.type === 'switch') {
        targetSwitch = node;
      } else if (swArg && nodes.find((n) => n.id.toLowerCase() === swArg.toLowerCase() && n.type === 'switch')) {
        targetSwitch = nodes.find((n) => n.id.toLowerCase() === swArg.toLowerCase() && n.type === 'switch');
      } else {
        // If run from a PC/Host, automatically find the local switch connected to this host
        const connectedSwId = node.interfaces?.[0]?.connectedToNodeId;
        targetSwitch = nodes.find((n) => n.id === connectedSwId && n.type === 'switch');
        if (!targetSwitch) {
          targetSwitch = nodes.find((n) => n.type === 'switch' && n.zone === node.zone);
        }
      }

      if (!targetSwitch) {
        addTerminalLog('No se encontró switch L2 disponible. Usa: mac-table <sw-aula1|sw-aula2|sw-aula3|sw-admin1|sw-admin2>', 'error');
        return;
      }

      const isRedirected = node.id !== targetSwitch.id;
      let output = '';
      if (isRedirected) {
        output += `[Redirección Switch Local] Consultando tabla CAM de ${targetSwitch.name} (${targetSwitch.label}):\n`;
      } else {
        output += `Tabla CAM / Direcciones MAC en ${targetSwitch.name} (${targetSwitch.label}):\n`;
      }

      output += `Segmentación Lógica: Estándar IEEE 802.1Q Habilitado\n`;
      output += `VLAN    Dirección MAC        Puerto          Tipo        Estado\n`;
      output += `-----------------------------------------------------------------------\n`;

      if (!targetSwitch.macTable || targetSwitch.macTable.length === 0) {
        output += `(Tabla CAM vacía actualmente. Se poblará dinámicamente con el tráfico).\n`;
      } else {
        targetSwitch.macTable.forEach((m) => {
          const vlanStr = String(m.vlan ?? 1).padEnd(7);
          const macStr = m.mac.padEnd(20);
          const portStr = m.port.padEnd(15);
          const typeStr = (m.type || 'DYNAMIC').padEnd(11);
          const stateStr = m.port === 'portUplink' ? 'Troncal 802.1Q' : 'Aprendido (CAM)';
          output += `${vlanStr} ${macStr} ${portStr} ${typeStr} ${stateStr}\n`;
        });
      }
      output += `-----------------------------------------------------------------------\n`;
      output += `Total de entradas: ${targetSwitch.macTable?.length || 0} | Comandos: "show vlan" o "vlan set <puerto> <vlan_id>"`;
      addTerminalLog(output, 'output');
      return;
    }

    // 6b. SHOW VLAN / VLAN LIST / VLAN SET (IEEE 802.1Q Configuration)
    if (cmd === 'vlan' || (cmd === 'show' && (args[0] === 'vlan' || args[0] === 'vlans'))) {
      const targetSw =
        node.type === 'switch'
          ? node
          : nodes.find((n) => n.id === node.interfaces?.[0]?.connectedToNodeId && n.type === 'switch');

      if (!targetSw) {
        addTerminalLog(`${node.name} no está conectado a ningún switch gestionable. Selecciona un switch o un PC cableado.`, 'error');
        return;
      }

      if (args[0] === 'set' || args[1] === 'set') {
        const portArg = args[0] === 'set' ? args[1] : args[2];
        const vlanArg = args[0] === 'set' ? Number(args[2]) : Number(args[3]);
        if (!portArg || !Number.isFinite(vlanArg)) {
          addTerminalLog('Uso: vlan set <puerto> <vlan_id>  (ejemplo: vlan set port3 99)', 'error');
          return;
        }
        handlePortVlanChange(targetSw.id, portArg, vlanArg);
        return;
      }

      let output = `Configuración VLAN IEEE 802.1Q en ${targetSw.name} (${targetSw.label}):\n`;
      output += `Puerto          Modo        VLAN ID    Dispositivo Conectado       Estado\n`;
      output += `-------------------------------------------------------------------------\n`;
      targetSw.interfaces.forEach((iface) => {
        const portStr = iface.name.padEnd(15);
        const modeStr = (iface.portMode === 'trunk' ? 'TRUNK' : 'ACCESS').padEnd(11);
        const vlanStr = (iface.portMode === 'trunk' ? (iface.allowedVlans?.join(',') || 'ALL') : String(iface.vlanId || 1)).padEnd(10);
        const connectedNode = nodes.find((n) =>
          n.interfaces?.some((i) => i.connectedToNodeId === targetSw.id && i.connectedToInterface === iface.name)
        );
        const devStr = (connectedNode ? `${connectedNode.name} (${connectedNode.label})` : 'Enlace Troncal Router').padEnd(27);
        output += `${portStr} ${modeStr} ${vlanStr} ${devStr} Activo\n`;
      });
      output += `-------------------------------------------------------------------------\n`;
      output += `Segmentación Lógica en el mismo hardware:\n`;
      output += `  Para aislar un equipo en otra VLAN: vlan set <puerto> <vlan_id>\n`;
      output += `  Ejemplo: "vlan set port3 99" -> el equipo de port3 quedará en la VLAN 99 sin conectividad L2 con el resto ni salida por su gateway.`;
      addTerminalLog(output, 'output');
      return;
    }

    // 7. NSLOOKUP
    if (cmd === 'nslookup') {
      if (!args[0]) {
        addTerminalLog('Uso: nslookup <nombre-de-dominio> (ej: nslookup campus.academia.edu)', 'error');
        return;
      }
      if (!requireIp()) return;
      const domain = args[0];
      const res = createDnsSimulation(node, domain, nodes, links);
      enqueuePacket(res.queryPacket);
      if (res.responsePacket) enqueuePacket(res.responsePacket, 1200);

      setTimeout(() => {
        if (res.outcome === 'timeout') {
          addTerminalLog(
            `;; connection timed out; no servers could be reached${res.dropReason ? `\n   Motivo: ${res.dropReason}` : ''}`,
            'error'
          );
          return;
        }
        const header = `Servidor DNS:  ${res.serverIp}\nAddress:       ${res.serverIp}#53\n\n`;
        if (res.outcome === 'nxdomain') {
          addTerminalLog(`${header}** server can't find ${domain}: NXDOMAIN`, 'error');
        } else {
          addTerminalLog(`${header}Nombre:  ${domain}\nAddress: ${res.resolvedIp}`, 'output');
        }
      }, res.responsePacket ? 2000 : 1500);
      return;
    }

    // 8. CURL (HTTP)
    if (cmd === 'curl') {
      if (!args[0]) {
        addTerminalLog('Uso: curl <url> (ej: curl http://campus.academia.edu)', 'error');
        return;
      }
      if (!requireIp()) return;
      const url = args.find((a) => !a.startsWith('-')) || args[0];
      const m = url.match(/^(?:(https?):\/\/)?([^/:]+)(?::(\d{1,5}))?(\/.*)?$/i);
      if (!m) {
        addTerminalLog(`curl: (3) URL rejected: Malformed input to a URL function`, 'error');
        return;
      }
      const scheme = (m[1] || 'http').toLowerCase();
      const host = m[2];
      const port = m[3] ? Number(m[3]) : scheme === 'https' ? 443 : 80;
      const path = m[4] || '/';

      const runHttp = (destIp: string) => {
        const destNode = resolveTarget(destIp, nodesRef.current).node;
        if (!destNode) {
          addTerminalLog(`curl: (28) Failed to connect to ${host} port ${port}: Timed out (${destIp} no existe en la simulación)`, 'error');
          return;
        }
        const res = createHttpSimulation(node, destNode, path, nodesRef.current, linksRef.current, port, destIp);
        res.packets.forEach((p, index) => enqueuePacket(p, index * 600));
        setTimeout(() => {
          if (res.outcome === 'ok') {
            if (scheme === 'https') addTerminalLog('(TLS no se simula: se muestra el contenido descifrado)', 'info');
            addTerminalLog(res.html || '', 'success');
          } else if (res.outcome === 'refused') {
            addTerminalLog(`curl: (7) Failed to connect to ${host} port ${port}: Connection refused (${destNode.name} responde con TCP RST: no hay ningún servicio en ese puerto)`, 'error');
          } else if (res.outcome === 'not-http') {
            addTerminalLog(`curl: (52) Empty reply from server (el puerto ${port} está abierto pero el servicio no habla HTTP)`, 'error');
          } else {
            addTerminalLog(`curl: (28) Failed to connect to ${host} port ${port}: Timed out${res.dropReason ? `\n   Motivo: ${res.dropReason}` : ''}`, 'error');
          }
        }, res.packets.length * 600 + 900);
      };

      // Hostnames with a domain go through the host's DNS resolver first
      if (!isValidIpv4(host) && host.includes('.')) {
        const dns = createDnsSimulation(node, host, nodes, links);
        enqueuePacket(dns.queryPacket);
        if (dns.responsePacket) enqueuePacket(dns.responsePacket, 900);
        setTimeout(() => {
          if (dns.outcome !== 'ok' || !dns.resolvedIp) {
            addTerminalLog(
              `curl: (6) Could not resolve host: ${host}${dns.outcome === 'nxdomain' ? ` (el DNS ${dns.serverIp} responde NXDOMAIN)` : dns.dropReason ? `\n   Motivo: ${dns.dropReason}` : ''}`,
              'error'
            );
            return;
          }
          runHttp(dns.resolvedIp);
        }, 1500);
        return;
      }

      const target = resolveTarget(host, nodes);
      if (!target.node && !isValidIpv4(target.ip)) {
        addTerminalLog(`curl: (6) Could not resolve host: ${host}`, 'error');
        return;
      }
      runHttp(target.ip);
      return;
    }

    // 9. TRACEROUTE / TRACERT
    if (cmd === 'traceroute' || cmd === 'tracert') {
      if (!args[0]) {
        addTerminalLog('Uso: traceroute <ip|nombre> (ej: traceroute 192.168.100.20)', 'error');
        return;
      }
      if (!requireIp()) return;
      const target = args[args.length - 1];
      const targetInfo = resolveTarget(target, nodes);

      if (!targetInfo.node) {
        addTerminalLog(
          isValidIpv4(targetInfo.ip)
            ? `traceroute: ${targetInfo.ip} no pertenece a ningún equipo de la topología simulada`
            : `traceroute: ${target}: Nombre o servicio desconocido`,
          'error'
        );
        return;
      }

      const { packets, hops } = createTracerouteSimulation(node, targetInfo.node, nodes, links, targetInfo.ip);
      addTerminalLog(`traceroute to ${target} (${targetInfo.ip}), 30 hops max, 60 byte packets`, 'info');
      packets.forEach((p, index) => enqueuePacket(p, index * 700));

      hops.forEach((h, index) => {
        setTimeout(() => {
          if (h.rttMs === null) {
            addTerminalLog(` ${h.ttl}  * * *${h.note ? `\n    (sin respuesta: ${h.note})` : ''}`, 'error');
            return;
          }
          const a = h.rttMs;
          const b = a + Math.random() * 0.4;
          const c = a + Math.random() * 0.4;
          addTerminalLog(` ${h.ttl}  ${h.name} (${h.ip})  ${a.toFixed(3)} ms  ${b.toFixed(3)} ms  ${c.toFixed(3)} ms`, 'output');
        }, (index + 1) * 700);
      });
      return;
    }

    // 10. PING
    if (cmd === 'ping') {
      let count = 4;
      let ttl = 64;
      let target = '';
      for (let i = 0; i < args.length; i++) {
        if ((args[i] === '-c' || args[i] === '-n') && args[i + 1]) count = Number(args[++i]);
        else if ((args[i] === '-t' || args[i] === '-i') && args[i + 1]) ttl = Number(args[++i]);
        else if (!args[i].startsWith('-')) target = args[i];
      }
      if (!target) {
        addTerminalLog('Uso: ping [-c N] [-t TTL] <ip|nombre> (ej: ping 192.168.10.12 o ping -t 1 192.168.200.50)', 'error');
        return;
      }
      if (!Number.isInteger(count) || count < 1 || count > 10) {
        addTerminalLog('ping: el número de paquetes (-c) debe estar entre 1 y 10 en el simulador.', 'error');
        return;
      }
      if (!Number.isInteger(ttl) || ttl < 1 || ttl > 255) {
        addTerminalLog('ping: el TTL (-t) debe estar entre 1 y 255.', 'error');
        return;
      }
      if (!requireIp()) return;

      const targetInfo = resolveTarget(target, nodes);
      const targetNode = targetInfo.node;
      const destIp = targetInfo.ip;
      if (!targetNode && !isValidIpv4(destIp)) {
        addTerminalLog(`ping: ${target}: Nombre o servicio desconocido`, 'error');
        return;
      }

      addTerminalLog(`PING ${target} (${destIp}) 56(84) bytes de datos.`, 'info');

      const printStats = (rtts: (number | null)[]) => {
        const ok = rtts.filter((r): r is number => r !== null);
        const loss = Math.round(((rtts.length - ok.length) / rtts.length) * 100);
        let text = `--- ${target} ping statistics ---\n${rtts.length} paquetes transmitidos, ${ok.length} recibidos, ${loss}% packet loss`;
        if (ok.length) {
          const avg = ok.reduce((a, b) => a + b, 0) / ok.length;
          const mdev = Math.sqrt(ok.reduce((a, b) => a + (b - avg) ** 2, 0) / ok.length);
          text += `\nrtt min/avg/max/mdev = ${Math.min(...ok).toFixed(3)}/${avg.toFixed(3)}/${Math.max(...ok).toFixed(3)}/${mdev.toFixed(3)} ms`;
        }
        addTerminalLog(text, ok.length === rtts.length ? 'info' : 'error');
      };

      // Loopback / own address: answered by the local IP stack, nothing leaves the NIC
      if (destIp.startsWith('127.') || targetNode?.id === node.id) {
        const rtts: number[] = [];
        for (let seq = 1; seq <= count; seq++) {
          const rtt = Number((0.03 + Math.random() * 0.03).toFixed(3));
          rtts.push(rtt);
          addTerminalLog(`64 bytes from ${destIp}: icmp_seq=${seq} ttl=64 time=${rtt} ms`, 'success');
        }
        printStats(rtts);
        return;
      }

      // ARP first if the next hop (destination or gateway) is not cached
      const isLocal = isSameSubnet(node.primaryIp || '', destIp, maskOf(node));
      const arpIp = isLocal ? destIp : node.gateway || '';
      const needArp = !!arpIp && !node.arpTable?.some((a) => a.ip === arpIp);
      if (needArp) {
        const { arpBroadcast, arpReply } = createArpResolution(node, arpIp, nodes, links);
        enqueuePacket(arpBroadcast);
        if (arpReply) enqueuePacket(arpReply, 600);
      }

      // Update dynamic CAM tables on connected switches with 802.1Q VLAN entries
      setNodes((prev) => updateSwitchMacTables(prev, node, targetNode));

      const results: (number | null)[] = [];
      for (let seq = 1; seq <= count; seq++) {
        setTimeout(() => {
          // Read the topology at send time: cutting a cable mid-ping affects the next packets
          const res = createPingSimulation(node, destIp, nodesRef.current, linksRef.current, seq, ttl);
          enqueuePacket(res.requestPacket);

          const finish = () => {
            addTerminalLog(res.logMessage, res.outcome === 'reply' ? 'success' : 'error');
            results.push(res.outcome === 'reply' ? res.rtt : null);
            if (results.length === count) setTimeout(() => printStats(results), 400);
          };

          if (res.replyPacket) {
            setTimeout(() => {
              enqueuePacket(res.replyPacket!);
              finish();
            }, 550);
          } else {
            finish();
          }
        }, (seq - 1) * 850 + (needArp ? 700 : 0));
      }
      return;
    }

    addTerminalLog(`Comando no reconocido: "${cmd}". Escribe "help" para ver comandos disponibles.`, 'error');
  };

  // Launch a guided educational mission
  const handleLaunchMission = (mission: LabMission) => {
    setSelectedNodeId(mission.sourceNodeId);
    setBottomTab('terminal');

    addTerminalLog(`[LAB INICIADO] ${mission.title}`, 'info');
    addTerminalLog(mission.description, 'output');
    addTerminalLog(`Ejecutando comando recomendado: ${mission.suggestedCommand}`, 'info');

    const sourceNode = nodes.find((n) => n.id === mission.sourceNodeId) || nodes[0];
    executeCommand(mission.suggestedCommand, sourceNode);

    if (!completedMissionIds.includes(mission.id)) {
      setCompletedMissionIds((prev) => [...prev, mission.id]);
      soundFx.playMissionComplete();
    }
  };

  // Handle custom packet injection from PacketBuilderModal
  const handleSendCustomPacket = (config: {
    sourceNodeId: string;
    targetNodeId: string;
    protocol: ProtocolType;
    ttl: number;
    payloadText: string;
  }) => {
    const srcNode = nodes.find((n) => n.id === config.sourceNodeId);
    const dstNode = nodes.find((n) => n.id === config.targetNodeId);
    if (!srcNode || !dstNode || srcNode.id === dstNode.id) return;

    if (config.protocol === 'ICMP') {
      const res = createPingSimulation(srcNode, dstNode.primaryIp || dstNode.name, nodes, links, 1, config.ttl);
      if (config.payloadText) {
        res.requestPacket.layer7 = { ...res.requestPacket.layer7, payload: { data: config.payloadText } };
      }
      enqueuePacket(res.requestPacket);
      if (res.replyPacket) enqueuePacket(res.replyPacket, 1200);
      addTerminalLog(
        `[INSPECTOR PDU] Paquete ICMP Echo inyectado desde ${srcNode.name} hacia ${dstNode.name} con TTL=${config.ttl}.`,
        'info'
      );
      setTimeout(() => addTerminalLog(`[INSPECTOR PDU] ${res.logMessage}`, res.outcome === 'reply' ? 'success' : 'error'), 1300);
    } else if (config.protocol === 'DNS') {
      const res = createDnsSimulation(srcNode, 'campus.academia.edu', nodes, links);
      enqueuePacket(res.queryPacket);
      if (res.responsePacket) enqueuePacket(res.responsePacket, 1200);
      addTerminalLog(
        `[INSPECTOR PDU] Consulta DNS (UDP/53) inyectada desde ${srcNode.name} hacia su resolver ${res.serverIp}.`,
        'info'
      );
    } else if (config.protocol === 'HTTP') {
      const res = createHttpSimulation(srcNode, dstNode, '/', nodes, links);
      res.packets.forEach((p, idx) => enqueuePacket(p, idx * 600));
      addTerminalLog(
        `[INSPECTOR PDU] Sesión TCP/HTTP inyectada desde ${srcNode.name} hacia ${dstNode.name}:80.`,
        'info'
      );
    } else if (config.protocol === 'ARP') {
      const { arpBroadcast, arpReply } = createArpResolution(srcNode, dstNode.primaryIp || '', nodes, links);
      enqueuePacket(arpBroadcast);
      if (arpReply) enqueuePacket(arpReply, 800);
      addTerminalLog(
        `[INSPECTOR PDU] Difusión ARP Request L2 (Who has ${dstNode.primaryIp}?) inyectada desde ${srcNode.name}.${arpReply ? '' : ' Nadie de su dominio de difusión tiene esa IP: no habrá respuesta.'}`,
        'info'
      );
    }
  };

  // Toggle firewall rule in router
  const handleToggleFirewallRule = (nodeId: string, ruleId: string) => {
    setNodes((prevNodes) =>
      prevNodes.map((n) => {
        if (n.id === nodeId && n.firewallRules) {
          const updatedRules = n.firewallRules.map((r) =>
            r.id === ruleId ? { ...r, enabled: !r.enabled } : r
          );
          return { ...n, firewallRules: updatedRules };
        }
        return n;
      })
    );
  };

  // Open Router ACL editor modal
  const handleOpenAclEditor = (routerId?: string) => {
    if (routerId) setSelectedAclRouterId(routerId);
    setIsAclModalOpen(true);
  };

  // Update complete router ACL rules
  const handleUpdateRouterRules = (routerId: string, updatedRules: FirewallRule[]) => {
    setNodes((prevNodes) =>
      prevNodes.map((n) => (n.id === routerId ? { ...n, firewallRules: updatedRules } : n))
    );
    addTerminalLog(
      `[ACL CONFIG] Listas de Control de Acceso actualizadas en ${routerId} (${updatedRules.length} reglas).`,
      'success'
    );
    soundFx.playConfigSuccess();
  };

  // Flush ARP table
  const handleFlushArp = (nodeId: string) => {
    setNodes((prevNodes) =>
      prevNodes.map((n) => (n.id === nodeId ? { ...n, arpTable: [] } : n))
    );
    addTerminalLog(`Tabla ARP vaciada en ${nodeId}.`, 'success');
  };

  // Export current network configuration to a downloadable JSON file
  const handleExportLab = () => {
    const labData = {
      version: '1.1',
      title: 'Topología de Red Personalizada',
      exportedAt: new Date().toISOString(),
      author: 'Un Fantasma en el Sistema',
      website: 'https://www.unfantasmaenelsistema.com/',
      routerMode,
      thresholds,
      nodes,
      links,
    };

    const blob = new Blob([JSON.stringify(labData, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laboratorio-red-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addTerminalLog(
      `[EXPORTACIÓN JSON] Topología exportada exitosamente (${nodes.length} nodos, ${links.length} enlaces). Archivo descargado.`,
      'success'
    );
    soundFx.playPacketDelivered();
  };

  // Import / Load a laboratory configuration from a JSON file
  const handleImportLab = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.links) || parsed.nodes.length === 0) {
          throw new Error('El archivo JSON no contiene las listas válidas de nodos y enlaces.');
        }

        const validTypes = ['pc', 'switch', 'router', 'ap', 'server', 'mobile', 'cloud'];
        const isValid = parsed.nodes.every(
          (n: any) =>
            typeof n?.id === 'string' &&
            typeof n.name === 'string' &&
            validTypes.includes(n.type) &&
            Array.isArray(n.interfaces) &&
            typeof n.x === 'number' &&
            typeof n.y === 'number'
        );
        if (!isValid) {
          throw new Error('Estructura de dispositivos inválida o incompleta.');
        }
        const ids = new Set(parsed.nodes.map((n: any) => n.id));
        const linksValid = parsed.links.every(
          (l: any) => typeof l?.id === 'string' && ids.has(l.fromNodeId) && ids.has(l.toNodeId)
        );
        if (!linksValid) {
          throw new Error('Hay enlaces que apuntan a dispositivos que no existen.');
        }

        // Fill optional fields older exports may lack
        const importedNodes: NetworkNode[] = parsed.nodes.map((n: any) => ({
          ...n,
          label: n.label || n.name,
          zone: n.zone || 'core-academic',
          primaryMac: n.primaryMac || n.interfaces[0]?.mac || '00:00:00:00:00:00',
          isOnline: n.isOnline !== false,
          stats: n.stats || { packetsSent: 0, packetsReceived: 0, packetsDropped: 0 },
        }));
        const importedLinks: NetworkLink[] = parsed.links.map((l: any) => ({
          ...l,
          status: l.status === 'down' || l.status === 'degraded' ? l.status : 'active',
          latency: typeof l.latency === 'number' ? l.latency : 1,
        }));

        setNodes(importedNodes);
        setLinks(importedLinks);
        if (parsed.thresholds && typeof parsed.thresholds.aulas === 'number') {
          setThresholds(parsed.thresholds);
        }

        resetSimulation();
        setHighlightedPacket(null);
        setSelectedNodeId(importedNodes[0].id);

        addTerminalLog(
          `[IMPORTACIÓN JSON] Topología "${parsed.title || file.name}" cargada con éxito (${importedNodes.length} nodos, ${importedLinks.length} enlaces).`,
          'success'
        );
        soundFx.playPacketDelivered();
      } catch (err: any) {
        addTerminalLog(
          `[ERROR DE IMPORTACIÓN] No se pudo cargar el archivo: ${err.message || 'JSON inválido.'}`,
          'error'
        );
        soundFx.playPacketDropped();
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 1. Header (Top Bar Contract) */}
      <TopNav
        activeView={bottomTab === 'wireshark' ? 'wireshark' : bottomTab === 'telemetry' ? 'telemetry' : 'topology'}
        setActiveView={(v) => {
          if (v === 'wireshark') setBottomTab('wireshark');
          if (v === 'terminal') setBottomTab('terminal');
          if (v === 'telemetry') setBottomTab('telemetry');
        }}
        onOpenLabs={() => setIsLabsModalOpen(true)}
        onOpenSubnets={() => setIsSubnetModalOpen(true)}
        onOpenPacketBuilder={() => setIsPacketBuilderOpen(true)}
        onOpenReport={() => setIsReportModalOpen(true)}
        onOpenAclEditor={() => handleOpenAclEditor()}
        onExportLab={handleExportLab}
        onImportLab={handleImportLab}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        packetCount={packetHistory.length}
      />

      {/* 2. Simulation Playback & Summary Bar */}
      <NetworkSummaryBar
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        onStepForward={() => {
          setIsPlaying(false);
          advancePackets('step');
        }}
        speed={speed}
        onChangeSpeed={setSpeed}
        onResetSimulation={resetSimulation}
        activePacketCount={activePackets.length}
        totalDevicesCount={nodes.length}
        routerMode={routerMode}
        onToggleRouterMode={handleToggleRouterMode}
        avgLatency={
          links.length > 0
            ? Number(
                (
                  links
                    .filter((l) => l.status === 'active')
                    .reduce((acc, l) => acc + (l.currentLatency || l.latency || 1.0), 0) /
                  Math.max(1, links.filter((l) => l.status === 'active').length)
                ).toFixed(1)
              )
            : 2.4
        }
      />

      {/* 3. Main Workspace: Split View with Canvas on Top, Docked Controls Below */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top 60%: Interactive SVG Topology Canvas */}
        <div className="flex-[60] min-h-[290px] p-3">
          <NetworkTopologyCanvas
            nodes={nodes}
            links={links}
            activePackets={activePackets}
            selectedNodeId={selectedNodeId}
            onSelectNode={(id) => setSelectedNodeId(id)}
            showLabels={showLabels}
            onToggleLabels={() => setShowLabels(!showLabels)}
            onOpenDeviceDetail={(node) => setDetailModalNode(node)}
            highlightedPacket={highlightedPacket}
            onClearHighlightedPath={() => setHighlightedPacket(null)}
            deliveredPacketsHistory={packetHistory}
            onSelectPacketForPath={(pkt) => setHighlightedPacket(pkt)}
            routerMode={routerMode}
            onToggleRouterMode={handleToggleRouterMode}
            onToggleLink={handleToggleLink}
          />
        </div>

        {/* Bottom 40%: Docked Console, Wireshark & Recharts Telemetry Tabs */}
        <div className="flex-[40] min-h-[240px] px-3 pb-3 flex flex-col">
          {/* Segmented Dock Tabs */}
          <div className="flex items-center justify-between pb-1.5 px-1 shrink-0">
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setBottomTab('terminal')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  bottomTab === 'terminal'
                    ? 'bg-slate-800 text-sky-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Terminal size={14} />
                <span>Terminal ({selectedNode.name})</span>
              </button>

              <button
                onClick={() => setBottomTab('wireshark')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  bottomTab === 'wireshark'
                    ? 'bg-slate-800 text-sky-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Network size={14} />
                <span>Inspector Wireshark ({packetHistory.length})</span>
              </button>

              <button
                onClick={() => setBottomTab('telemetry')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  bottomTab === 'telemetry'
                    ? 'bg-slate-800 text-sky-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BarChart3 size={14} />
                <span>Telemetría (Recharts)</span>
              </button>
            </div>

            <button
              onClick={() => setDetailModalNode(selectedNode)}
              className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-medium px-2 py-1 rounded bg-slate-900 border border-slate-800 transition-colors"
            >
              <span>Inspeccionar {selectedNode.name}</span>
            </button>
          </div>

          {/* Dock Content */}
          <div className="flex-1 min-h-0">
            {bottomTab === 'terminal' ? (
              <TerminalConsole
                currentNode={selectedNode}
                allNodes={nodes}
                onSelectNode={(id) => setSelectedNodeId(id)}
                onExecuteCommand={executeCommand}
                historyLogs={terminalLogs}
                onClearHistory={() => setTerminalLogs([])}
              />
            ) : bottomTab === 'wireshark' ? (
              <WiresharkInspector
                packetLogs={packetHistory}
                onClearLogs={() => setPacketHistory([])}
                onHighlightPath={(pkt) => {
                  setHighlightedPacket(pkt);
                }}
              />
            ) : (
              <NetworkTelemetryDashboard
                timeSeriesData={timeSeriesData}
                packetLogs={packetHistory}
                nodes={nodes}
                links={links}
                onGenerateBurst={handleGenerateBurst}
                thresholds={thresholds}
                onUpdateThresholds={setThresholds}
                routerMode={routerMode}
                onToggleRouterMode={handleToggleRouterMode}
              />
            )}
          </div>
        </div>
      </div>

      {/* Footer Bar with Logo (sin deformar) & Link */}
      <footer className="flex items-center justify-between px-5 py-2 bg-slate-950 border-t border-slate-800 text-xs text-slate-400 shrink-0">
        <a
          href="https://www.unfantasmaenelsistema.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors group"
          title="Visitar Un Fantasma en el Sistema"
        >
          <img
            src={LOGO_URL}
            alt="Logo Un Fantasma en el Sistema"
            className="w-5 h-5 aspect-square object-contain shrink-0 group-hover:scale-110 transition-transform"
          />
          <span className="font-semibold text-slate-200 group-hover:text-sky-400 transition-colors">
            Un Fantasma en el Sistema
          </span>
          <span className="text-slate-500 font-mono text-[11px] hidden sm:inline">
            — unfantasmaenelsistema.com
          </span>
          <ExternalLink size={12} className="text-slate-500 group-hover:text-sky-400 transition-colors" />
        </a>

        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="hidden md:inline">Simulador de Redes Educativo · IEEE 802.1Q · Enrutamiento estático · ACLs · Latencia Dinámica</span>
          <a
            href="https://www.unfantasmaenelsistema.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 hover:text-sky-300 hover:underline transition-colors"
          >
            unfantasmaenelsistema.com
          </a>
        </div>
      </footer>

      {/* Device Inspector Modal */}
      <DeviceDetailModal
        node={detailModalNode ? nodes.find((n) => n.id === detailModalNode.id) || detailModalNode : null}
        links={links}
        onClose={() => setDetailModalNode(null)}
        onToggleFirewallRule={handleToggleFirewallRule}
        onFlushArp={handleFlushArp}
        onPortVlanChange={handlePortVlanChange}
        onOpenAclEditor={handleOpenAclEditor}
      />

      {/* Guided Lab Missions Modal */}
      <LabMissionsModal
        isOpen={isLabsModalOpen}
        onClose={() => setIsLabsModalOpen(false)}
        onLaunchMission={handleLaunchMission}
        completedMissionIds={completedMissionIds}
      />

      {/* Subnetting & VLSM Educational Tool Modal */}
      <SubnetCalculatorModal
        isOpen={isSubnetModalOpen}
        onClose={() => setIsSubnetModalOpen(false)}
        nodes={nodes}
      />

      {/* Interactive Packet Crafter / PDU Generator Modal */}
      <PacketBuilderModal
        isOpen={isPacketBuilderOpen}
        onClose={() => setIsPacketBuilderOpen(false)}
        nodes={nodes}
        onSendCustomPacket={handleSendCustomPacket}
      />

      {/* Academic Laboratory Report Exporter Modal */}
      <LabReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        nodes={nodes}
        links={links}
        packetLogs={packetHistory}
        completedMissionIds={completedMissionIds}
      />

      {/* Router Access Control Lists (ACL) Modal */}
      <RouterAclModal
        isOpen={isAclModalOpen}
        onClose={() => setIsAclModalOpen(false)}
        nodes={nodes}
        links={links}
        selectedRouterId={selectedAclRouterId}
        onUpdateRouterRules={handleUpdateRouterRules}
      />
    </div>
  );
}
