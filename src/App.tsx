/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
  getNodeVlan,
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

export default function App() {
  // Network Topo State
  const [nodes, setNodes] = useState<NetworkNode[]>(INITIAL_NODES);
  const [links, setLinks] = useState<NetworkLink[]>(INITIAL_LINKS);
  const [routerMode, setRouterMode] = useState<RouterInterconnectionMode>('interconnected');
  const [thresholds, setThresholds] = useState<SubnetThresholds>({
    aulas: 350,
    invitados: 100,
    admin: 220,
    errors: 1,
    enabled: true,
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string>('pc-101');
  const [detailModalNode, setDetailModalNode] = useState<NetworkNode | null>(null);

  // Simulation Packets & Execution
  const [activePackets, setActivePackets] = useState<SimulatedPacket[]>([]);
  const [packetHistory, setPacketHistory] = useState<SimulatedPacket[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(1);
  const [showLabels, setShowLabels] = useState<boolean>(true);

  // UI Panels & Labs
  const [bottomTab, setBottomTab] = useState<'terminal' | 'wireshark' | 'telemetry'>('terminal');
  const [topView, setTopView] = useState<'topology' | 'telemetry'>('topology');
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

  // Toggle individual link status (Link Cut / Cable Fault simulation)
  const handleToggleLink = (linkId: string) => {
    setLinks((prevLinks) =>
      prevLinks.map((l) => {
        if (l.id === linkId) {
          const nextStatus = l.status === 'down' ? 'active' : 'down';
          addTerminalLog(
            `[FALLO FÍSICO / ENLACE] Enlace ${l.id} (${l.fromPort} ↔ ${l.toPort}): estado cambiado a ${nextStatus.toUpperCase()}. ${
              nextStatus === 'down'
                ? '⚠️ Cable desconectado. Las tramas en este tramo se descartarán.'
                : '✅ Enlace físico restablecido (LINK UP).'
            }`,
            nextStatus === 'active' ? 'success' : 'error'
          );
          if (nextStatus === 'down') {
            soundFx.playPacketDropped();
          } else {
            soundFx.playPacketDelivered();
          }
          return { ...l, status: nextStatus };
        }
        return l;
      })
    );
  };

  // Toggle between Interconnected Routers (Trunk UP) and Independent Networks (Trunk DOWN)
  const handleToggleRouterMode = () => {
    setRouterMode((prev) => {
      const next: RouterInterconnectionMode = prev === 'interconnected' ? 'independent' : 'interconnected';
      setLinks((prevLinks) =>
        prevLinks.map((l) =>
          l.id === 'link-trunk-routers'
            ? { ...l, status: next === 'interconnected' ? 'active' : 'down' }
            : l
        )
      );
      addTerminalLog(
        next === 'interconnected'
          ? '[TOPOLOGÍA] Enlace Troncal 10G CONECTADO (UP): Routers interconectados (10.0.0.1 <-> 10.0.0.2). Enrutamiento L3 habilitado entre Aulas y Administración.'
          : '[TOPOLOGÍA] Enlace Troncal DESCONECTADO (DOWN): Redes 100% Independientes. Router Académico y Router Administración operan aislados.',
        next === 'interconnected' ? 'success' : 'error'
      );
      return next;
    });
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

  // Main Animation Tick for packet flow - Packet travel time fluctuates realistically based on link latency & subnet load
  useEffect(() => {
    if (!isPlaying || activePackets.length === 0) return;

    const interval = setInterval(() => {
      setActivePackets((prevPackets) => {
        const nextPackets: SimulatedPacket[] = [];

        for (const pkt of prevPackets) {
          if (pkt.status === 'delivered' || pkt.status === 'dropped') {
            continue; // Will be cleaned up
          }

          const currentStep = pkt.steps[pkt.currentStepIndex];
          if (!currentStep) continue;

          // Real packet travel time fluctuating based on physical link latency and subnet congestion
          const stepLatency = currentStep.stepLatencyMs || 2.0;
          // Normalizes progress increment: 1ms LAN is swift (~0.07), 4ms Wi-Fi is ~0.05, 25ms-50ms congested WAN travels visibly slower (~0.02)
          const latencyFactor = Math.max(0.45, Math.min(3.5, stepLatency / 3.2));
          const progressInc = (0.055 / latencyFactor) * speed;
          const newProgress = pkt.progress + progressInc;

          if (newProgress < 1.0) {
            nextPackets.push({ ...pkt, progress: newProgress });
          } else {
            // Step completed!
            if (currentStep.isDropped) {
              // Packet was dropped at this device (e.g. firewall or link down)
              pkt.status = 'dropped';
              setHighlightedPacket(pkt);
              soundFx.playPacketDropped();
              // Update node stats
              setNodes((prevNodes) =>
                prevNodes.map((n) =>
                  n.id === currentStep.toNodeId
                    ? {
                        ...n,
                        stats: { ...n.stats, packetsDropped: n.stats.packetsDropped + 1 },
                      }
                    : n
                )
              );
              continue;
            }

            // Learn MAC address in intermediate switches
            const destNodeObj = nodes.find((n) => n.id === currentStep.toNodeId);
            if (destNodeObj && destNodeObj.type === 'switch') {
              const srcMac = pkt.layer2.sourceMac;
              setNodes((prevNodes) =>
                prevNodes.map((n) => {
                  if (n.id === destNodeObj.id) {
                    const currentTable = n.macTable || [];
                    const exists = currentTable.some((m) => m.mac === srcMac);
                    if (!exists) {
                      return {
                        ...n,
                        macTable: [
                          ...currentTable,
                          {
                            mac: srcMac,
                            port: currentStep.fromNodeId.startsWith('pc') ? 'port1' : 'portUplink',
                            vlan: pkt.layer2.vlanId || 10,
                            ageSeconds: 1,
                            type: 'DYNAMIC' as const,
                          },
                        ],
                      };
                    }
                  }
                  return n;
                })
              );
            }

            // Next step or finished?
            if (pkt.currentStepIndex < pkt.steps.length - 1) {
              soundFx.playPacketHop();
              nextPackets.push({
                ...pkt,
                currentStepIndex: pkt.currentStepIndex + 1,
                progress: 0,
              });
            } else {
              // Final Destination reached!
              pkt.status = 'delivered';
              setHighlightedPacket(pkt);
              soundFx.playPacketDelivered();

              // Update ARP table on destination if ARP resolution
              if (pkt.protocol === 'ARP' && pkt.layer7.payload?.targetIp) {
                const targetIp = pkt.layer7.payload.targetIp;
                const senderIp = pkt.layer7.payload.senderIp;
                const senderMac = pkt.layer7.payload.senderMac;

                setNodes((prevNodes) =>
                  prevNodes.map((n) => {
                    if (n.primaryIp === targetIp) {
                      const currentArp = n.arpTable || [];
                      if (!currentArp.some((a) => a.ip === senderIp)) {
                        return {
                          ...n,
                          arpTable: [
                            ...currentArp,
                            {
                              ip: senderIp,
                              mac: senderMac,
                              interfaceName: 'eth0',
                              type: 'dynamic',
                              updatedAt: Date.now(),
                            },
                          ],
                        };
                      }
                    }
                    return n;
                  })
                );
              }
            }
          }
        }

        return nextPackets;
      });
    }, 40);

    return () => clearInterval(interval);
  }, [isPlaying, speed, activePackets.length, nodes]);

  // Real-time telemetry sampler for Recharts (every 2.5 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const timeLabel = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      // Calculate recent packet activity
      let aulasTraffic = 0;
      let invitadosTraffic = 0;
      let adminTraffic = 0;
      let recentErrors = 0;

      activePackets.forEach((p) => {
        const src = nodes.find((n) => n.id === p.sourceNodeId);
        if (p.status === 'dropped') recentErrors++;
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
          const fromNode = nodes.find((n) => n.id === link.fromNodeId);
          const toNode = nodes.find((n) => n.id === link.toNodeId);

          let linkTraffic = aulasTraffic;
          let threshold = thresholds.aulas;

          const isGuestLink = fromNode?.zone === 'wifi-guest' || toNode?.zone === 'wifi-guest';
          const isAdminLink =
            fromNode?.zone === 'admin-zone1' ||
            fromNode?.zone === 'admin-zone2' ||
            toNode?.zone === 'admin-zone1' ||
            toNode?.zone === 'admin-zone2' ||
            fromNode?.zone === 'wan' ||
            toNode?.zone === 'wan';

          if (link.id === 'link-trunk-routers') {
            linkTraffic = aulasTraffic + adminTraffic + invitadosTraffic;
            threshold = thresholds.aulas + thresholds.admin;
          } else if (isGuestLink) {
            linkTraffic = invitadosTraffic;
            threshold = thresholds.invitados;
          } else if (isAdminLink) {
            linkTraffic = adminTraffic;
            threshold = thresholds.admin;
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
  }, [activePackets, nodes, thresholds]);

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

  // Handle IEEE 802.1Q port VLAN assignment change
  const handlePortVlanChange = (switchId: string, portName: string, newVlanId: number) => {
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
      `[VLAN 802.1Q] Switch ${switchId}: Puerto ${portName} asignado a VLAN ${newVlanId}. Dominio de difusión y segmentación L2 actualizados.`,
      'success'
    );
  };

  // Command Execution Engine
  const executeCommand = (rawCommand: string, node: NetworkNode) => {
    const trimmed = rawCommand.trim();
    if (!trimmed) return;

    addTerminalLog(`${node.name}:~$ ${trimmed}`, 'cmd');

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // 1. HELP
    if (cmd === 'help') {
      addTerminalLog(
        `Comandos Disponibles en el Simulador:
  ping <ip|host>         Envía paquetes ICMP Echo Request y calcula RTT.
  traceroute <ip|host>   Traza los routers del camino mostrando cada salto.
  arp -a                 Muestra la tabla de resolución ARP (IP a MAC).
  arp -d                 Limpia la caché ARP del equipo para forzar broadcast.
  ipconfig / ifconfig    Muestra IPs, máscaras, gateways y direcciones MAC.
  curl <url>             Realiza petición HTTP y muestra el HTML recibido.
  nslookup <dominio>     Consulta el servidor DNS de la academia (SRV-Campus).
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
          logText += `  Sec ${r.sequence || 10}: [${r.enabled ? 'ACTIVA' : 'INACTIVA'}] ${r.action} ${r.protocol} ${r.sourceSubnet} -> ${r.destSubnet}${r.destPort && r.destPort !== 'any' ? ` eq ${r.destPort}` : ''} (${r.description})\n`;
        });
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
      } else {
        output = `Rutas Activas del Host:\n  0.0.0.0          0.0.0.0          ${node.gateway || '192.168.10.1'}     eth0      1\n  ${node.primaryIp?.replace(/\.\d+$/, '.0')}   255.255.255.0    Enlace local      eth0      0`;
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

      if (node.type === 'switch') {
        targetSwitch = node;
      } else if (args[0] && nodes.find((n) => n.id.toLowerCase() === args[0].toLowerCase() && n.type === 'switch')) {
        targetSwitch = nodes.find((n) => n.id.toLowerCase() === args[0].toLowerCase() && n.type === 'switch');
      } else {
        // If run from a PC/Host, automatically find the local switch connected to this host
        const connectedSwId = node.interfaces?.[0]?.connectedToNodeId;
        targetSwitch = nodes.find((n) => n.id === connectedSwId && n.type === 'switch');
        if (!targetSwitch) {
          targetSwitch = nodes.find((n) => n.type === 'switch' && n.zone === node.zone) || nodes.find((n) => n.id === 'sw-aula1');
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
          const vlanStr = String(m.vlan ?? 10).padEnd(7);
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
      if (args[0] === 'set' || args[1] === 'set') {
        const portArg = args[0] === 'set' ? args[1] : args[2];
        const vlanArg = args[0] === 'set' ? parseInt(args[2], 10) : parseInt(args[3], 10);

        let targetSw =
          node.type === 'switch'
            ? node
            : nodes.find((n) => n.id === node.interfaces?.[0]?.connectedToNodeId && n.type === 'switch') ||
              nodes.find((n) => n.id === 'sw-aula1');

        if (!targetSw) {
          addTerminalLog('Switch no encontrado para configurar VLAN.', 'error');
          return;
        }
        if (!portArg || isNaN(vlanArg)) {
          addTerminalLog('Uso: vlan set <puerto> <vlan_id>  (ejemplo: vlan set port3 99)', 'error');
          return;
        }
        handlePortVlanChange(targetSw.id, portArg, vlanArg);
        return;
      }

      let targetSw =
        node.type === 'switch'
          ? node
          : nodes.find((n) => n.id === node.interfaces?.[0]?.connectedToNodeId && n.type === 'switch') ||
            nodes.find((n) => n.id === 'sw-aula1');

      if (!targetSw) {
        addTerminalLog('Switch no encontrado.', 'error');
        return;
      }

      let output = `Configuración VLAN IEEE 802.1Q en ${targetSw.name} (${targetSw.label}):\n`;
      output += `Puerto          Modo        VLAN ID    Dispositivo Conectado       Estado\n`;
      output += `-------------------------------------------------------------------------\n`;
      targetSw.interfaces.forEach((iface) => {
        const portStr = iface.name.padEnd(15);
        const modeStr = (iface.portMode === 'trunk' ? 'TRUNK' : 'ACCESS').padEnd(11);
        const vlanStr = (iface.portMode === 'trunk' ? (iface.allowedVlans?.join(',') || 'ALL') : String(iface.vlanId || 10)).padEnd(10);
        const connectedNode = nodes.find((n) =>
          n.interfaces?.some((i) => i.connectedToNodeId === targetSw?.id && i.connectedToInterface === iface.name)
        );
        const devStr = (connectedNode ? `${connectedNode.name} (${connectedNode.label})` : 'Enlace Troncal Router').padEnd(27);
        output += `${portStr} ${modeStr} ${vlanStr} ${devStr} Activo\n`;
      });
      output += `-------------------------------------------------------------------------\n`;
      output += `Segmentación Lógica en el mismo hardware:\n`;
      output += `  Para aislar un equipo en otra VLAN: vlan set <puerto> <vlan_id>\n`;
      output += `  Ejemplo: "vlan set port3 99" -> PC-103 quedará en VLAN 99 y no podrá comunicarse en L2 con PC-101.`;
      addTerminalLog(output, 'output');
      return;
    }

    // 7. NSLOOKUP
    if (cmd === 'nslookup') {
      if (!args[0]) {
        addTerminalLog('Uso: nslookup <nombre-de-dominio> (ej: nslookup campus.academia.edu)', 'error');
        return;
      }
      const domain = args[0];
      const { queryPacket, responsePacket, resolvedIp } = createDnsSimulation(
        node,
        domain,
        nodes,
        links
      );

      // Enqueue packets
      setActivePackets((prev) => [...prev, queryPacket]);
      setPacketHistory((prev) => [queryPacket, ...prev]);

      if (responsePacket) {
        setTimeout(() => {
          setActivePackets((prev) => [...prev, responsePacket]);
          setPacketHistory((prev) => [responsePacket, ...prev]);
        }, 1200);
      }

      addTerminalLog(
        `Servidor DNS:  ${node.dnsServer || '192.168.200.50'}
Address:       ${node.dnsServer || '192.168.200.50'}#53

Respuesta no autoritativa:
Nombre:  ${domain}
Address: ${resolvedIp || 'No resuelto'}`,
        'output'
      );
      return;
    }

    // 8. CURL (HTTP)
    if (cmd === 'curl') {
      if (!args[0]) {
        addTerminalLog('Uso: curl <url> (ej: curl http://campus.academia.edu)', 'error');
        return;
      }
      const rawUrl = args[0].replace(/^https?:\/\//, '');
      const partsUrl = rawUrl.split('/');
      const host = partsUrl[0];
      const path = '/' + partsUrl.slice(1).join('/');

      const targetInfo = resolveTarget(host, nodes);
      if (!targetInfo.node) {
        addTerminalLog(`curl: (6) Could not resolve host: ${host}`, 'error');
        return;
      }

      const packets = createHttpSimulation(node, targetInfo.node, path, nodes, links);
      packets.forEach((p, index) => {
        setTimeout(() => {
          setActivePackets((prev) => [...prev, p]);
          setPacketHistory((prev) => [p, ...prev]);
        }, index * 800);
      });

      setTimeout(() => {
        if (packets.some((p) => p.status === 'dropped')) {
          addTerminalLog(`curl: (7) Failed to connect to ${host}: Conexión rechazada o bloqueada por firewall`, 'error');
        } else {
          addTerminalLog(
            `<!DOCTYPE html>
<html>
<head>
  <title>Campus Virtual Academia</title>
</head>
<body>
  <h1>Bienvenido a la Academia Digital</h1>
  <p>Acceso a cursos de Redes, Ciberseguridad y Desarrollo.</p>
</body>
</html>`,
            'success'
          );
        }
      }, 2200);
      return;
    }

    // 9. TRACEROUTE / TRACERT
    if (cmd === 'traceroute' || cmd === 'tracert') {
      if (!args[0]) {
        addTerminalLog('Uso: traceroute <ip|nombre> (ej: traceroute 192.168.100.20)', 'error');
        return;
      }
      const target = args[0];
      const targetInfo = resolveTarget(target, nodes);

      if (!targetInfo.node) {
        addTerminalLog(`traceroute: No se pudo resolver la ruta hacia ${target}`, 'error');
        return;
      }

      const packets = createTracerouteSimulation(node, targetInfo.node, nodes, links);
      packets.forEach((p, index) => {
        setTimeout(() => {
          setActivePackets((prev) => [...prev, p]);
          setPacketHistory((prev) => [p, ...prev]);
        }, index * 700);
      });

      addTerminalLog(`traceroute to ${target} (${targetInfo.node.primaryIp || target}), 30 hops max, 60 byte packets`, 'info');

      // Output hops in sequence
      packets.forEach((p, index) => {
        setTimeout(() => {
          const hopNode = nodes.find((n) => n.id === p.destNodeId);
          const rtt = (1.8 + Math.random() * 2).toFixed(2);
          addTerminalLog(
            ` ${index + 1}  ${hopNode?.hostname || hopNode?.name || p.destNodeId} (${hopNode?.primaryIp || ''})  ${rtt} ms  ${(parseFloat(rtt) + 0.3).toFixed(2)} ms`,
            'output'
          );
        }, (index + 1) * 700);
      });
      return;
    }

    // 10. PING
    if (cmd === 'ping') {
      if (!args[0]) {
        addTerminalLog('Uso: ping <ip|nombre> (ej: ping 192.168.10.12 o ping campus.academia.edu)', 'error');
        return;
      }
      const target = args[0];
      const targetInfo = resolveTarget(target, nodes);
      const targetNode = targetInfo.node;

      addTerminalLog(`PING ${target} (${targetNode?.primaryIp || target}) 56(84) bytes de datos.`, 'info');

      // Check if ARP resolution is needed first (if local subnet and not in source ARP table)
      const needArp =
        targetNode &&
        isSameSubnet(node.primaryIp || '', targetNode.primaryIp || '') &&
        !node.arpTable?.some((a) => a.ip === targetNode.primaryIp);

      if (needArp && targetNode) {
        const { arpBroadcast, arpReply } = createArpResolution(node, targetNode.primaryIp || '', nodes, links);
        setActivePackets((prev) => [...prev, arpBroadcast]);
        setPacketHistory((prev) => [arpBroadcast, ...prev]);
        if (arpReply) {
          setTimeout(() => {
            setActivePackets((prev) => [...prev, arpReply]);
            setPacketHistory((prev) => [arpReply, ...prev]);
          }, 600);
        }
      }

      // Update dynamic CAM tables on connected switches with 802.1Q VLAN entries
      setNodes((prev) => updateSwitchMacTables(prev, node, targetNode));

      // Generate sequence of 4 ping echo requests with real fluctuating latency
      const pingRtts: number[] = [];
      let droppedCount = 0;

      for (let seq = 1; seq <= 4; seq++) {
        setTimeout(() => {
          const { requestPacket, replyPacket, logMessage, rtt } = createPingSimulation(
            node,
            targetNode?.primaryIp || target,
            nodes,
            links,
            seq
          );

          setActivePackets((prev) => [...prev, requestPacket]);
          setPacketHistory((prev) => [requestPacket, ...prev]);

          if (replyPacket) {
            setTimeout(() => {
              setActivePackets((prev) => [...prev, replyPacket]);
              setPacketHistory((prev) => [replyPacket, ...prev]);
              pingRtts.push(rtt);
              addTerminalLog(logMessage, 'success');

              if (seq === 4) {
                setTimeout(() => {
                  if (pingRtts.length > 0) {
                    const min = Math.min(...pingRtts).toFixed(1);
                    const max = Math.max(...pingRtts).toFixed(1);
                    const avg = (pingRtts.reduce((a, b) => a + b, 0) / pingRtts.length).toFixed(1);
                    const mdev = (Math.abs(Number(max) - Number(min)) / 2).toFixed(1);
                    const loss = Math.round((droppedCount / 4) * 100);
                    addTerminalLog(
                      `--- ${target} ping statistics ---
4 paquetes transmitidos, ${pingRtts.length} recibidos, ${loss}% packet loss, tiempo total ~3200ms
rtt min/avg/max/mdev = ${min}/${avg}/${max}/${mdev} ms (fluctuación dinámica por carga)`,
                      'info'
                    );
                  }
                }, 500);
              }
            }, 550);
          } else {
            droppedCount++;
            addTerminalLog(logMessage, 'error');

            if (seq === 4) {
              setTimeout(() => {
                addTerminalLog(
                  `--- ${target} ping statistics ---
4 paquetes transmitidos, 0 recibidos, 100% packet loss (destino inaccesible / filtrado por ACL)`,
                  'error'
                );
              }, 500);
            }
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
    if (!srcNode || !dstNode) return;

    if (config.protocol === 'ICMP') {
      const { requestPacket, replyPacket } = createPingSimulation(
        srcNode,
        dstNode.primaryIp || dstNode.name,
        nodes,
        links,
        1
      );
      requestPacket.layer3.ttl = config.ttl;
      if (config.payloadText) {
        requestPacket.layer7.message = config.payloadText;
      }
      setActivePackets((prev) => [...prev, requestPacket]);
      setPacketHistory((prev) => [requestPacket, ...prev]);

      if (config.ttl > 2 && replyPacket) {
        setTimeout(() => {
          setActivePackets((prev) => [...prev, replyPacket]);
          setPacketHistory((prev) => [replyPacket, ...prev]);
        }, 1200);
      }
      addTerminalLog(
        `[INSPECTOR PDU] Paquete ICMP Echo inyectado desde ${srcNode.name} hacia ${dstNode.name} con TTL=${config.ttl}.`,
        'info'
      );
    } else if (config.protocol === 'DNS') {
      const { queryPacket, responsePacket } = createDnsSimulation(
        srcNode,
        'campus.academia.edu',
        nodes,
        links
      );
      setActivePackets((prev) => [...prev, queryPacket]);
      setPacketHistory((prev) => [queryPacket, ...prev]);
      if (responsePacket) {
        setTimeout(() => {
          setActivePackets((prev) => [...prev, responsePacket]);
          setPacketHistory((prev) => [responsePacket, ...prev]);
        }, 1200);
      }
      addTerminalLog(
        `[INSPECTOR PDU] Consulta DNS (UDP/53) inyectada desde ${srcNode.name}.`,
        'info'
      );
    } else if (config.protocol === 'HTTP') {
      const packets = createHttpSimulation(srcNode, dstNode, '/', nodes, links);
      packets.forEach((p, idx) => {
        setTimeout(() => {
          setActivePackets((prev) => [...prev, p]);
          setPacketHistory((prev) => [p, ...prev]);
        }, idx * 800);
      });
      addTerminalLog(
        `[INSPECTOR PDU] Secuencia HTTP GET inyectada desde ${srcNode.name} hacia ${dstNode.name}.`,
        'info'
      );
    } else if (config.protocol === 'ARP') {
      const { arpBroadcast, arpReply } = createArpResolution(
        srcNode,
        dstNode.primaryIp || '',
        nodes,
        links
      );
      setActivePackets((prev) => [...prev, arpBroadcast]);
      setPacketHistory((prev) => [arpBroadcast, ...prev]);
      if (arpReply) {
        setTimeout(() => {
          setActivePackets((prev) => [...prev, arpReply]);
          setPacketHistory((prev) => [arpReply, ...prev]);
        }, 800);
      }
      addTerminalLog(
        `[INSPECTOR PDU] Difusión ARP Request L2 (Who has ${dstNode.primaryIp}?) inyectada desde ${srcNode.name}.`,
        'info'
      );
    }
  };

  // Toggle firewall rule in router
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
      version: '1.0',
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

        if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) {
          throw new Error('El archivo JSON no contiene las listas válidas de nodos y enlaces.');
        }

        const isValid = parsed.nodes.every((n: any) => n.id && n.name && n.type && n.interfaces);
        if (!isValid) {
          throw new Error('Estructura de dispositivos inválida o incompleta.');
        }

        setNodes(parsed.nodes);
        setLinks(parsed.links);
        if (parsed.routerMode === 'interconnected' || parsed.routerMode === 'independent') {
          setRouterMode(parsed.routerMode);
        }
        if (parsed.thresholds && typeof parsed.thresholds.aulas === 'number') {
          setThresholds(parsed.thresholds);
        }

        setActivePackets([]);
        if (parsed.nodes[0]) {
          setSelectedNodeId(parsed.nodes[0].id);
        }

        addTerminalLog(
          `[IMPORTACIÓN JSON] Topología "${parsed.title || file.name}" cargada con éxito (${parsed.nodes.length} nodos, ${parsed.links.length} enlaces).`,
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
          setActivePackets((prev) =>
            prev.map((p) => {
              const currentStep = p.steps[p.currentStepIndex];
              if (!currentStep) return p;
              if (p.currentStepIndex < p.steps.length - 1) {
                return { ...p, currentStepIndex: p.currentStepIndex + 1, progress: 0 };
              }
              return { ...p, progress: 1 };
            })
          );
        }}
        speed={speed}
        onChangeSpeed={setSpeed}
        onResetSimulation={() => setActivePackets([])}
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
            src="/assets/aistudio/icono_81a3db5b.png"
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
          <span className="hidden md:inline">Simulador de Redes Educativo · IEEE 802.1Q · OSPF/Enrutamiento · Latencia Dinámica</span>
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
        selectedRouterId={selectedAclRouterId}
        onUpdateRouterRules={handleUpdateRouterRules}
      />
    </div>
  );
}
