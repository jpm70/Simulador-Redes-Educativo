import {
  NetworkNode,
  NetworkLink,
  SimulatedPacket,
  PacketAnimationStep,
  ProtocolType,
  ArpTableEntry,
  MacTableEntry,
  FirewallRule,
} from '../types/network';

// DNS Dictionary for the Academy
export const DNS_RECORDS: Record<string, string> = {
  'campus.academia.edu': '192.168.200.50',
  'academia.local': '192.168.200.50',
  'moodle.academia.edu': '192.168.200.50',
  'gestion.academia.local': '192.168.100.20',
  'db.academia.local': '192.168.100.20',
  'dns.google': '8.8.8.8',
  'google.com': '8.8.8.8',
};

// Convert IPv4 string to 32-bit unsigned integer
export function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

// Check if an IP address belongs to a CIDR range (e.g. 192.168.10.0/24, 172.16.50.15/32, or "any")
export function isIpInCidr(ip: string, cidr: string): boolean {
  if (!cidr || cidr.toLowerCase() === 'any' || cidr === '0.0.0.0/0' || cidr === '0.0.0.0') {
    return true;
  }
  if (!ip) return false;

  const cleanCidr = cidr.trim();
  const cleanIp = ip.trim();

  // If exact IP match without slash
  if (!cleanCidr.includes('/')) {
    return cleanIp === cleanCidr;
  }

  const [range, prefixStr] = cleanCidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
  if (prefix === 0) return true;

  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  const ipInt = ipToInt(cleanIp);
  const rangeInt = ipToInt(range);

  return (ipInt & mask) === (rangeInt & mask);
}

// Evaluate if a single firewall / ACL rule matches packet attributes
export function doesRuleMatchPacket(
  rule: FirewallRule,
  sourceIp: string,
  destIp: string,
  protocol: ProtocolType | 'ANY' = 'ICMP',
  destPort: number = 0,
  sourcePort: number = 0
): boolean {
  // 1. Source IP check
  if (!isIpInCidr(sourceIp, rule.sourceSubnet)) {
    return false;
  }

  // 2. Dest IP check
  if (!isIpInCidr(destIp, rule.destSubnet)) {
    return false;
  }

  // 3. Protocol check
  const ruleProto = (rule.protocol || 'ANY').toUpperCase();
  const pktProto = (protocol || 'ANY').toUpperCase();

  if (ruleProto !== 'ANY') {
    if (ruleProto === 'TCP') {
      if (pktProto !== 'TCP' && pktProto !== 'HTTP' && pktProto !== 'HTTPS' && pktProto !== 'SSH') {
        return false;
      }
    } else if (ruleProto === 'UDP') {
      if (pktProto !== 'UDP' && pktProto !== 'DNS') {
        return false;
      }
    } else if (ruleProto === 'ICMP') {
      if (pktProto !== 'ICMP') {
        return false;
      }
    } else if (ruleProto === 'HTTP') {
      if (pktProto !== 'HTTP' && (pktProto !== 'TCP' || (destPort !== 80 && destPort !== 443))) {
        return false;
      }
    } else if (ruleProto === 'DNS') {
      if (pktProto !== 'DNS' && (pktProto !== 'UDP' || destPort !== 53)) {
        return false;
      }
    } else if (ruleProto !== pktProto) {
      return false;
    }
  }

  // 4. Destination Port check (if specified and not 'any' or empty)
  if (rule.destPort && rule.destPort !== 'any') {
    let effectivePort = destPort;
    if (!effectivePort) {
      if (pktProto === 'HTTP') effectivePort = 80;
      else if (pktProto === 'HTTPS') effectivePort = 443;
      else if (pktProto === 'DNS') effectivePort = 53;
      else if (pktProto === 'SSH') effectivePort = 22;
    }

    if (effectivePort > 0) {
      const ports = rule.destPort.split(',').map((p) => p.trim());
      const portMatch = ports.some((p) => {
        if (p.includes('-')) {
          const [min, max] = p.split('-').map(Number);
          return effectivePort >= min && effectivePort <= max;
        }
        return Number(p) === effectivePort;
      });
      if (!portMatch) return false;
    }
  }

  return true;
}

// Evaluate ACL rules on a specific router
export function evaluateRouterAcl(
  router: NetworkNode,
  sourceIp: string,
  destIp: string,
  protocol: ProtocolType | 'ANY' = 'ICMP',
  destPort: number = 0,
  sourcePort: number = 0
): { matchedRule?: FirewallRule; isAllowed: boolean; dropReason?: string } {
  if (!router.firewallRules || router.firewallRules.length === 0) {
    return { isAllowed: true };
  }

  const activeRules = router.firewallRules
    .filter((r) => r.enabled !== false)
    .sort((a, b) => (a.sequence || 999) - (b.sequence || 999));

  for (const rule of activeRules) {
    if (doesRuleMatchPacket(rule, sourceIp, destIp, protocol, destPort, sourcePort)) {
      if (rule.action === 'DROP') {
        return {
          matchedRule: rule,
          isAllowed: false,
          dropReason: `Fallo por Lista de Control de Acceso (ACL): ${router.name} aplicó la regla [Sec ${rule.sequence || 'ACL'}] "${rule.description}". Tráfico DENEGADO (DROP).`,
        };
      } else {
        // ALLOW / PERMIT: First-match permits traffic through this router
        return {
          matchedRule: rule,
          isAllowed: true,
        };
      }
    }
  }

  return { isAllowed: true };
}

// Check if two IPs are on the same /24 subnet
export function isSameSubnet(ip1: string, ip2: string): boolean {
  const parts1 = ip1.split('.');
  const parts2 = ip2.split('.');
  if (parts1.length !== 4 || parts2.length !== 4) return false;
  return parts1[0] === parts2[0] && parts1[1] === parts2[1] && parts1[2] === parts2[2];
}

// Find link between two node IDs
export function findLink(links: NetworkLink[], nodeA: string, nodeB: string): NetworkLink | undefined {
  return links.find(
    (l) =>
      (l.fromNodeId === nodeA && l.toNodeId === nodeB) ||
      (l.fromNodeId === nodeB && l.toNodeId === nodeA)
  );
}

// Calculate dynamic link latency fluctuating with subnet traffic load and jitter
export function calculateLinkDynamicLatency(
  link: NetworkLink,
  subnetLoadBytes: number = 0,
  thresholdBytes: number = 15000
): { currentLatency: number; jitter: number; queueDelayMs: number } {
  const base = link.latency || 1.0;
  
  // Calculate queue delay based on subnet load vs threshold
  let queueDelay = 0;
  const loadRatio = thresholdBytes > 0 ? subnetLoadBytes / thresholdBytes : 0;

  if (loadRatio > 1.0) {
    // Congestion / Bufferbloat! Threshold breached
    const excess = loadRatio - 1.0;
    const mult = link.type === 'wifi' ? 12 : link.type === 'trunk' ? 8 : 4;
    queueDelay = mult + Math.min(35, excess * 15);
  } else if (loadRatio > 0.4) {
    // Moderate traffic
    const mult = link.type === 'wifi' ? 3.5 : link.type === 'trunk' ? 2.0 : 1.0;
    queueDelay = (loadRatio - 0.4) * mult;
  } else {
    // Normal baseline traffic: minimal natural micro-fluctuation
    queueDelay = Math.random() * 0.2;
  }

  // Fluctuation / Jitter
  const baseJitter = link.type === 'wifi' ? 0.8 : link.type === 'trunk' ? 0.3 : 0.1;
  const activeJitter = baseJitter * (1 + loadRatio * 1.5);
  const jitterOffset = (Math.random() * 2 - 1) * activeJitter;

  const dynamicLatency = Math.max(0.4, Number((base + queueDelay + jitterOffset).toFixed(1)));
  const reportedJitter = Number(activeJitter.toFixed(1));

  return {
    currentLatency: dynamicLatency,
    jitter: reportedJitter,
    queueDelayMs: Number(queueDelay.toFixed(1)),
  };
}

// Resolve IP or domain name to destination Node
export function resolveTarget(target: string, nodes: NetworkNode[]): { ip: string; node?: NetworkNode; isDnsResolved: boolean } {
  const cleanTarget = target.trim().toLowerCase();
  
  // 1. Direct DNS lookup
  if (DNS_RECORDS[cleanTarget]) {
    const resolvedIp = DNS_RECORDS[cleanTarget];
    const node = nodes.find((n) => n.primaryIp === resolvedIp || n.interfaces.some((i) => i.ip === resolvedIp));
    return { ip: resolvedIp, node, isDnsResolved: true };
  }

  // 2. Direct IP match
  const nodeByIp = nodes.find((n) => n.primaryIp === cleanTarget || n.interfaces.some((i) => i.ip === cleanTarget));
  if (nodeByIp) {
    return { ip: cleanTarget, node: nodeByIp, isDnsResolved: false };
  }

  // 3. Match by node name or hostname (e.g. "pc-102", "srv-campus")
  const nodeByName = nodes.find(
    (n) =>
      n.name.toLowerCase() === cleanTarget ||
      n.id.toLowerCase() === cleanTarget ||
      (n.hostname && n.hostname.toLowerCase() === cleanTarget)
  );
  if (nodeByName && nodeByName.primaryIp) {
    return { ip: nodeByName.primaryIp, node: nodeByName, isDnsResolved: false };
  }

  // Fallback: assume raw IP even if node not found in topology (e.g. unknown external IP)
  return { ip: cleanTarget, node: undefined, isDnsResolved: false };
}

// Helper to get VLAN assigned to a node's interface or switch port
export function getNodeVlan(node: NetworkNode, nodes: NetworkNode[]): number {
  // Check if node is connected to a switch port
  const connectedSwId = node.interfaces?.[0]?.connectedToNodeId;
  const connectedIfaceName = node.interfaces?.[0]?.connectedToInterface;
  if (connectedSwId) {
    const sw = nodes.find((n) => n.id === connectedSwId);
    if (sw) {
      const swPort = sw.interfaces?.find((i) => i.name === connectedIfaceName);
      if (swPort?.vlanId) return swPort.vlanId;
    }
  }
  // Fallback by zone
  switch (node.zone) {
    case 'aula1': return 10;
    case 'aula2': return 20;
    case 'aula3': return 30;
    case 'wifi-guest': return 50;
    case 'admin-zone1': return 100;
    case 'admin-zone2': return 200;
    default: return 1;
  }
}

// Calculate the network hops from source node to destination node
export function computePathHops(
  sourceNode: NetworkNode,
  destNode: NetworkNode,
  nodes: NetworkNode[],
  links: NetworkLink[],
  protocol: ProtocolType | 'ANY' = 'ICMP',
  destPort: number = 0,
  sourcePort: number = 0
): { hops: string[]; dropAtNodeId?: string; dropReason?: string } {
  // Helper to evaluate router ACLs sequentially on hops
  const applyRouterAcls = (candidateHops: string[]): { hops: string[]; dropAtNodeId?: string; dropReason?: string } => {
    const srcIp = sourceNode.primaryIp || '';
    const dstIp = destNode.primaryIp || '';

    for (let i = 0; i < candidateHops.length; i++) {
      const nodeId = candidateHops[i];
      const node = nodes.find((n) => n.id === nodeId);
      if (node && node.type === 'router' && node.firewallRules && node.firewallRules.length > 0) {
        const aclResult = evaluateRouterAcl(node, srcIp, dstIp, protocol, destPort, sourcePort);
        if (!aclResult.isAllowed) {
          return {
            hops: candidateHops.slice(0, i + 1),
            dropAtNodeId: node.id,
            dropReason: aclResult.dropReason,
          };
        }
      }
    }
    return { hops: candidateHops };
  };

  // Same node
  if (sourceNode.id === destNode.id) {
    return { hops: [sourceNode.id] };
  }

  // Helper to find local switch for a node
  const getLocalSwitchOrAp = (node: NetworkNode): string => {
    switch (node.zone) {
      case 'aula1': return 'sw-aula1';
      case 'aula2': return 'sw-aula2';
      case 'aula3': return 'sw-aula3';
      case 'wifi-guest': return 'ap-guest';
      case 'admin-zone1': return 'sw-admin1';
      case 'admin-zone2': return 'sw-admin2';
      case 'core-academic': return 'r-academico';
      case 'core-admin': return 'r-admin';
      case 'wan': return 'cloud-internet';
      default: return 'r-academico';
    }
  };

  const srcSwitch = getLocalSwitchOrAp(sourceNode);
  const dstSwitch = getLocalSwitchOrAp(destNode);

  // 1. Same classroom / local segment (e.g. Aula 1 PC-101 to PC-102)
  if (sourceNode.zone === destNode.zone) {
    const sw = nodes.find((n) => n.id === srcSwitch);
    const srcVlan = getNodeVlan(sourceNode, nodes);
    const dstVlan = getNodeVlan(destNode, nodes);

    // IEEE 802.1Q Logical Segmentation check within the same physical hardware!
    if (srcVlan !== dstVlan && sw) {
      // If one port was moved to a different or isolated VLAN (e.g. VLAN 99), direct L2 switching is blocked!
      if (srcVlan === 99 || dstVlan === 99) {
        return {
          hops: [sourceNode.id, srcSwitch],
          dropAtNodeId: srcSwitch,
          dropReason: `Aislamiento L2 IEEE 802.1Q: El switch ${sw.name} bloquea la conmutación directa. El puerto de ${sourceNode.name} (VLAN ${srcVlan}) y el puerto de ${destNode.name} (VLAN ${dstVlan}) pertenecen a dominios de difusión lógicos aislados en el mismo switch físico.`,
        };
      }
      // If different routed VLANs on same switch (Router-on-a-stick trunk needed)
      const gatewayRouter = sourceNode.zone.startsWith('admin') ? 'r-admin' : 'r-academico';
      return applyRouterAcls([sourceNode.id, srcSwitch, gatewayRouter, srcSwitch, destNode.id]);
    }

    if (sourceNode.zone === 'aula1') return { hops: [sourceNode.id, 'sw-aula1', destNode.id] };
    if (sourceNode.zone === 'aula2') return { hops: [sourceNode.id, 'sw-aula2', destNode.id] };
    if (sourceNode.zone === 'aula3') return { hops: [sourceNode.id, 'sw-aula3', destNode.id] };
    if (sourceNode.zone === 'wifi-guest') return { hops: [sourceNode.id, 'ap-guest', destNode.id] };
    if (sourceNode.zone === 'admin-zone1') return { hops: [sourceNode.id, 'sw-admin1', destNode.id] };
    if (sourceNode.zone === 'admin-zone2') return { hops: [sourceNode.id, 'sw-admin2', destNode.id] };
  }

  // 2. Intra-Academic Router (e.g. Aula 1 to Aula 2, Aula 3, or Guest to Internet via academic)
  const isAcademicZone = (zone: string) => ['aula1', 'aula2', 'aula3', 'wifi-guest', 'core-academic'].includes(zone);
  const isAdminZone = (zone: string) => ['admin-zone1', 'admin-zone2', 'core-admin', 'wan'].includes(zone);

  if (isAcademicZone(sourceNode.zone) && isAcademicZone(destNode.zone)) {
    // Inter-classroom routing: PC-src -> SW-src -> R-Academico -> SW-dst -> PC-dst
    return applyRouterAcls([sourceNode.id, srcSwitch, 'r-academico', dstSwitch, destNode.id]);
  }

  if (isAdminZone(sourceNode.zone) && isAdminZone(destNode.zone)) {
    // Inter-admin routing: PC-src -> SW-src -> R-Admin -> SW-dst -> PC-dst
    return applyRouterAcls([sourceNode.id, srcSwitch, 'r-admin', dstSwitch, destNode.id]);
  }

  // Check if Inter-Router Trunk Link is active or disconnected (independent networks mode)
  const trunkLink = links.find((l) => l.id === 'link-trunk-routers');
  const isTrunkConnected = trunkLink ? trunkLink.status === 'active' : true;

  // 3. Cross-Router: Academic <-> Admin / WAN
  if (isAcademicZone(sourceNode.zone) && isAdminZone(destNode.zone)) {
    if (!isTrunkConnected) {
      return {
        hops: [sourceNode.id, srcSwitch, 'r-academico'],
        dropAtNodeId: 'r-academico',
        dropReason: 'Topología Redes Independientes: El enlace troncal (10.0.0.0/30) hacia Router Administración está desconectado. Red inalcanzable (Network Unreachable).',
      };
    }
    const hops = [sourceNode.id, srcSwitch, 'r-academico', 'r-admin'];
    if (destNode.id !== 'r-admin') {
      hops.push(dstSwitch);
      if (dstSwitch !== destNode.id) hops.push(destNode.id);
    }
    return applyRouterAcls(hops);
  }

  if (isAdminZone(sourceNode.zone) && isAcademicZone(destNode.zone)) {
    if (!isTrunkConnected) {
      return {
        hops: [sourceNode.id, srcSwitch, 'r-admin'],
        dropAtNodeId: 'r-admin',
        dropReason: 'Topología Redes Independientes: El enlace troncal hacia Router Académico está desconectado. Subred de aulas inalcanzable.',
      };
    }
    const hops = [sourceNode.id, srcSwitch, 'r-admin', 'r-academico'];
    if (destNode.id !== 'r-academico') {
      hops.push(dstSwitch);
      if (dstSwitch !== destNode.id) hops.push(destNode.id);
    }
    return applyRouterAcls(hops);
  }

  // Fallback direct path
  if (!isTrunkConnected && isAcademicZone(sourceNode.zone) !== isAcademicZone(destNode.zone)) {
    return {
      hops: [sourceNode.id, srcSwitch, isAcademicZone(sourceNode.zone) ? 'r-academico' : 'r-admin'],
      dropAtNodeId: isAcademicZone(sourceNode.zone) ? 'r-academico' : 'r-admin',
      dropReason: 'Modo Redes Independientes: Enlace troncal apagado.',
    };
  }
  return applyRouterAcls([sourceNode.id, srcSwitch, 'r-academico', 'r-admin', destNode.id]);
}

// Build animation steps with detailed educational explanations, IEEE 802.1Q tags, and latency
export function createPacketSteps(
  hops: string[],
  links: NetworkLink[],
  nodes: NetworkNode[],
  protocol: ProtocolType,
  dropAtNodeId?: string,
  dropReason?: string,
  vlanId?: number
): PacketAnimationStep[] {
  const steps: PacketAnimationStep[] = [];

  for (let i = 0; i < hops.length - 1; i++) {
    const fromId = hops[i];
    const toId = hops[i + 1];
    const link = findLink(links, fromId, toId);
    const linkId = link ? link.id : `${fromId}-${toId}`;

    const fromNode = nodes.find((n) => n.id === fromId);
    const toNode = nodes.find((n) => n.id === toId);

    const fromName = fromNode ? fromNode.name : fromId;
    const toName = toNode ? toNode.name : toId;

    const isLinkDown = link?.status === 'down';
    const isDropped = toId === dropAtNodeId || isLinkDown;
    const finalDropReason = isLinkDown
      ? `Fallo físico de enlace: El enlace entre ${fromName} y ${toName} está desconectado (LINK DOWN).`
      : dropReason;
    const vid = vlanId || 10;

    // Determine latency for this physical link
    const stepLatencyMs = link ? (link.currentLatency || link.latency || 1.0) : 1.0;
    let explanation = '';

    if (isLinkDown) {
      explanation = `[ENLACE CAÍDO] Trama descartada: El enlace físico entre ${fromName} y ${toName} se encuentra en estado DOWN.`;
    } else if (fromNode?.type === 'pc' && toNode?.type === 'switch') {
      explanation = `${fromName} transmite la trama Ethernet estándar (sin etiquetar) al puerto de acceso del switch ${toName} (VLAN ${vid}, retardo enlace: ${stepLatencyMs}ms).`;
    } else if (fromNode?.type === 'switch' && toNode?.type === 'pc') {
      explanation = `Switch ${fromName} retira la etiqueta 802.1Q (Untagged) y conmuta la trama en Capa 2 hacia el puerto de acceso de ${toName} (${stepLatencyMs}ms).`;
    } else if (fromNode?.type === 'switch' && toNode?.type === 'router') {
      explanation = `Switch ${fromName} inserta cabecera IEEE 802.1Q [VLAN ${vid}, TPID 0x8100] por el enlace troncal hacia el Gateway ${toName} (${stepLatencyMs}ms).`;
    } else if (fromNode?.type === 'router' && toNode?.type === 'router') {
      explanation = `Enlace troncal P2P: ${fromName} conmuta el paquete por la ruta 10.0.0.0/30 hacia el siguiente router ${toName} (troncal 10G, ${stepLatencyMs}ms).`;
    } else if (fromNode?.type === 'router' && toNode?.type === 'switch') {
      explanation = `Router ${fromName} decrece el TTL, recalcula checksum y envía la trama etiquetada (802.1Q VLAN ${vid}) hacia el switch ${toName} (${stepLatencyMs}ms).`;
    } else if (fromNode?.type === 'ap' || toNode?.type === 'ap') {
      explanation = `Enlace inalámbrico Wi-Fi 802.11 (VLAN 50 Invitados): transmisión RF en el medio compartido entre ${fromName} y ${toName} (${stepLatencyMs}ms).`;
    } else if (fromNode?.type === 'cloud' || toNode?.type === 'cloud') {
      explanation = `Enlace WAN hacia la nube externa: propagación por la red de Internet hacia ${toName} (latencia WAN ${stepLatencyMs}ms).`;
    } else {
      explanation = `Tráfico ${protocol} viajando de ${fromName} a ${toName} [VLAN ${vid}] (latencia enlace: ${stepLatencyMs}ms).`;
    }

    if (isDropped && finalDropReason) {
      explanation = `[BLOQUEO DE TRÁFICO] ${toName}: ${finalDropReason}`;
    }

    steps.push({
      fromNodeId: fromId,
      toNodeId: toId,
      linkId,
      explanation,
      isDropped,
      dropReason: isDropped ? finalDropReason : undefined,
      stepLatencyMs,
    });

    if (isDropped) {
      break; // Stop animating further hops
    }
  }

  return steps;
}

// Generate an ICMP Echo Request / Reply pair or Ping sequence with realistic fluctuating latency
export function createPingSimulation(
  sourceNode: NetworkNode,
  destIp: string,
  nodes: NetworkNode[],
  links: NetworkLink[],
  seq: number = 1
): { requestPacket: SimulatedPacket; replyPacket?: SimulatedPacket; logMessage: string; rtt: number } {
  const destInfo = resolveTarget(destIp, nodes);
  const destNode = destInfo.node;

  // Resolve target MAC address (or gateway MAC if remote)
  const isLocal = destNode && isSameSubnet(sourceNode.primaryIp || '', destNode.primaryIp || '');
  const destMac = isLocal && destNode ? destNode.primaryMac : '00:50:56:01:00:01'; // Default gateway MAC

  if (!destNode) {
    // Unreachable host
    const req: SimulatedPacket = {
      id: `pkt-ping-${Date.now()}-${seq}`,
      timestamp: Date.now(),
      sourceNodeId: sourceNode.id,
      protocol: 'ICMP',
      color: '#38bdf8', // Sky blue
      sizeBytes: 64,
      totalLatencyMs: 0,
      layer2: {
        destMac: 'FF:FF:FF:FF:FF:FF',
        sourceMac: sourceNode.primaryMac,
        etherType: '0x0800 (IPv4)',
      },
      layer3: {
        sourceIP: sourceNode.primaryIp || '192.168.10.11',
        destIP: destIp,
        ttl: 64,
        protocolNumber: 1,
        protocolName: 'ICMP',
      },
      layer4: {
        icmpType: 'Echo Request',
        sequenceNumber: seq,
      },
      layer7: {
        application: 'ICMP',
        message: `Echo (ping) request id=0x1234 seq=${seq}/64 ttl=64`,
      },
      summary: `ICMP Echo Request a ${destIp} (Host inaccesible o fuera de red)`,
      status: 'dropped',
      currentStepIndex: 0,
      steps: [
        {
          fromNodeId: sourceNode.id,
          toNodeId: 'r-academico',
          linkId: 'link-sw1-racad',
          explanation: `El router no encuentra ruta válida hacia la IP ${destIp}.`,
          isDropped: true,
          dropReason: 'ICMP Destination Host Unreachable: Red no conocida.',
          stepLatencyMs: 2.0,
        },
      ],
      progress: 0,
    };
    return {
      requestPacket: req,
      logMessage: `From ${sourceNode.primaryIp}: Destination Host Unreachable for ${destIp}`,
      rtt: 0,
    };
  }

  // Calculate Forward Path
  const sourceVlan = getNodeVlan(sourceNode, nodes);
  const destVlan = destNode ? getNodeVlan(destNode, nodes) : sourceVlan;
  const { hops: fwdHops, dropAtNodeId, dropReason } = computePathHops(sourceNode, destNode, nodes, links);
  const reqSteps = createPacketSteps(fwdHops, links, nodes, 'ICMP', dropAtNodeId, dropReason, sourceVlan);

  const reqLatency = reqSteps.reduce((acc, s) => acc + (s.stepLatencyMs || 1.0), 0);

  const requestPacket: SimulatedPacket = {
    id: `pkt-req-${Date.now()}-${seq}`,
    timestamp: Date.now(),
    sourceNodeId: sourceNode.id,
    destNodeId: destNode.id,
    protocol: 'ICMP',
    color: '#0284c7', // Cyan blue
    sizeBytes: 64,
    totalLatencyMs: Number(reqLatency.toFixed(1)),
    layer2: {
      destMac: destMac,
      sourceMac: sourceNode.primaryMac,
      etherType: '0x0800 (IPv4)',
      vlanId: sourceVlan,
      isTagged: true,
      tpid: '0x8100 (IEEE 802.1Q)',
      priority: 0,
    },
    layer3: {
      sourceIP: sourceNode.primaryIp || '0.0.0.0',
      destIP: destNode.primaryIp || destIp,
      ttl: 64,
      protocolNumber: 1,
      protocolName: 'ICMP',
    },
    layer4: {
      icmpType: 'Echo Request',
      sequenceNumber: seq,
    },
    layer7: {
      application: 'ICMP',
      message: `Echo (ping) request seq=${seq} ttl=64 payload=32bytes`,
      payload: { data: 'abcdefghijklmnopqrstuvwabcdefghi' },
    },
    summary: `ICMP Echo Request: ${sourceNode.name} (${sourceNode.primaryIp}) -> ${destNode.name} (${destNode.primaryIp}) [VLAN ${sourceVlan}]`,
    status: dropAtNodeId ? 'dropped' : 'traveling',
    currentStepIndex: 0,
    steps: reqSteps,
    progress: 0,
  };

  if (dropAtNodeId) {
    return {
      requestPacket,
      logMessage: `From ${dropAtNodeId}: Destination Net Prohibited / Dropped: ${dropReason || 'Blocked'}`,
      rtt: 0,
    };
  }

  // Calculate Reverse Path (Reply)
  const { hops: revHops } = computePathHops(destNode, sourceNode, nodes, links);
  const repSteps = createPacketSteps(revHops, links, nodes, 'ICMP', undefined, undefined, destVlan);

  const repLatency = repSteps.reduce((acc, s) => acc + (s.stepLatencyMs || 1.0), 0);
  const microJitter = (Math.random() * 0.4) - 0.2;
  const calculatedRtt = Math.max(0.8, Number((reqLatency + repLatency + microJitter).toFixed(1)));

  requestPacket.totalLatencyMs = calculatedRtt;

  const replyPacket: SimulatedPacket = {
    id: `pkt-rep-${Date.now()}-${seq}`,
    timestamp: Date.now() + 500,
    sourceNodeId: destNode.id,
    destNodeId: sourceNode.id,
    protocol: 'ICMP',
    color: '#059669', // Emerald green
    sizeBytes: 64,
    totalLatencyMs: calculatedRtt,
    layer2: {
      destMac: sourceNode.primaryMac,
      sourceMac: destNode.primaryMac,
      etherType: '0x0800 (IPv4)',
      vlanId: destVlan,
      isTagged: true,
      tpid: '0x8100 (IEEE 802.1Q)',
      priority: 0,
    },
    layer3: {
      sourceIP: destNode.primaryIp || destIp,
      destIP: sourceNode.primaryIp || '0.0.0.0',
      ttl: 64 - (revHops.length > 3 ? 1 : 0),
      protocolNumber: 1,
      protocolName: 'ICMP',
    },
    layer4: {
      icmpType: 'Echo Reply',
      sequenceNumber: seq,
    },
    layer7: {
      application: 'ICMP',
      message: `Echo (ping) reply seq=${seq} ttl=63 time=${calculatedRtt.toFixed(1)}ms${calculatedRtt > 20 ? ' (alta latencia/congestión)' : ''}`,
    },
    summary: `ICMP Echo Reply: ${destNode.name} -> ${sourceNode.name} (Éxito, ${calculatedRtt.toFixed(1)}ms) [VLAN ${destVlan}]`,
    status: 'traveling',
    currentStepIndex: 0,
    steps: repSteps,
    progress: 0,
  };

  return {
    requestPacket,
    replyPacket,
    logMessage: `64 bytes from ${destNode.primaryIp}: icmp_seq=${seq} ttl=64 time=${calculatedRtt.toFixed(2)} ms${calculatedRtt > 20 ? ' (congestión)' : ''}`,
    rtt: calculatedRtt,
  };
}

// Generate ARP Request and ARP Reply
export function createArpResolution(
  sourceNode: NetworkNode,
  targetIp: string,
  nodes: NetworkNode[],
  links: NetworkLink[]
): { arpBroadcast: SimulatedPacket; arpReply?: SimulatedPacket } {
  const destInfo = resolveTarget(targetIp, nodes);
  const destNode = destInfo.node;

  // ARP Request: Broadcast L2
  const localSwitchId =
    sourceNode.zone === 'aula1' ? 'sw-aula1' :
    sourceNode.zone === 'aula2' ? 'sw-aula2' :
    sourceNode.zone === 'aula3' ? 'sw-aula3' :
    sourceNode.zone === 'wifi-guest' ? 'ap-guest' :
    sourceNode.zone === 'admin-zone1' ? 'sw-admin1' : 'sw-admin2';

  const sourceVlan = getNodeVlan(sourceNode, nodes);
  const destVlan = destNode ? getNodeVlan(destNode, nodes) : sourceVlan;

  const localSwitch = nodes.find((n) => n.id === localSwitchId);
  const link1 = findLink(links, sourceNode.id, localSwitchId);
  const step1Latency = link1 ? (link1.currentLatency || link1.latency || 1.0) : 1.0;

  const broadcastStep: PacketAnimationStep = {
    fromNodeId: sourceNode.id,
    toNodeId: localSwitchId,
    linkId: `${sourceNode.id}-${localSwitchId}`,
    explanation: `ARP Request Broadcast: ${sourceNode.name} pregunta: ¿Quién tiene la IP ${targetIp}? ¡Díselo a ${sourceNode.primaryIp}! [VLAN ${sourceVlan}] (${step1Latency}ms)`,
    isBroadcast: true,
    stepLatencyMs: step1Latency,
  };

  const arpBroadcast: SimulatedPacket = {
    id: `arp-req-${Date.now()}`,
    timestamp: Date.now(),
    sourceNodeId: sourceNode.id,
    protocol: 'ARP',
    color: '#eab308', // Yellow broadcast
    sizeBytes: 42,
    totalLatencyMs: step1Latency,
    layer2: {
      destMac: 'FF:FF:FF:FF:FF:FF',
      sourceMac: sourceNode.primaryMac,
      etherType: '0x0806 (ARP)',
      vlanId: sourceVlan,
      isTagged: true,
      tpid: '0x8100 (IEEE 802.1Q)',
      priority: 0,
    },
    layer3: {
      sourceIP: sourceNode.primaryIp || '0.0.0.0',
      destIP: targetIp,
      ttl: 1,
      protocolNumber: 0,
      protocolName: 'ARP',
    },
    layer4: {},
    layer7: {
      application: 'ARP',
      message: `Who has ${targetIp}? Tell ${sourceNode.primaryIp}`,
      payload: {
        hardwareType: 'Ethernet (1)',
        protocolType: 'IPv4 (0x0800)',
        opcode: 'Request (1)',
        senderMac: sourceNode.primaryMac,
        senderIp: sourceNode.primaryIp,
        targetMac: '00:00:00:00:00:00',
        targetIp: targetIp,
      },
    },
    summary: `ARP Request (Broadcast): ¿Quién tiene ${targetIp}? [VLAN ${sourceVlan}]`,
    status: 'traveling',
    currentStepIndex: 0,
    steps: [broadcastStep],
    progress: 0,
  };

  if (!destNode) return { arpBroadcast };

  const link2 = findLink(links, destNode.id, localSwitchId);
  const step2Latency = link2 ? (link2.currentLatency || link2.latency || 1.0) : 1.0;

  // ARP Reply: Unicast L2
  const replyStep: PacketAnimationStep = {
    fromNodeId: destNode.id,
    toNodeId: sourceNode.id,
    linkId: `${destNode.id}-${sourceNode.id}`,
    explanation: `ARP Reply (Unicast): ${destNode.name} responde: ${targetIp} está en ${destNode.primaryMac} [VLAN ${destVlan}] (${step2Latency}ms)`,
    stepLatencyMs: step2Latency,
  };

  const arpReply: SimulatedPacket = {
    id: `arp-rep-${Date.now()}`,
    timestamp: Date.now() + 400,
    sourceNodeId: destNode.id,
    destNodeId: sourceNode.id,
    protocol: 'ARP',
    color: '#10b981', // Emerald reply
    sizeBytes: 42,
    totalLatencyMs: step2Latency,
    layer2: {
      destMac: sourceNode.primaryMac,
      sourceMac: destNode.primaryMac,
      etherType: '0x0806 (ARP)',
      vlanId: destVlan,
      isTagged: true,
      tpid: '0x8100 (IEEE 802.1Q)',
      priority: 0,
    },
    layer3: {
      sourceIP: targetIp,
      destIP: sourceNode.primaryIp || '0.0.0.0',
      ttl: 1,
      protocolNumber: 0,
      protocolName: 'ARP',
    },
    layer4: {},
    layer7: {
      application: 'ARP',
      message: `${targetIp} is at ${destNode.primaryMac}`,
      payload: {
        hardwareType: 'Ethernet (1)',
        protocolType: 'IPv4 (0x0800)',
        opcode: 'Reply (2)',
        senderMac: destNode.primaryMac,
        senderIp: targetIp,
        targetMac: sourceNode.primaryMac,
        targetIp: sourceNode.primaryIp,
      },
    },
    summary: `ARP Reply (Unicast): ${targetIp} está en ${destNode.primaryMac}`,
    status: 'traveling',
    currentStepIndex: 0,
    steps: [replyStep],
    progress: 0,
  };

  return { arpBroadcast, arpReply };
}

// Generate DNS Query and Response
export function createDnsSimulation(
  sourceNode: NetworkNode,
  domain: string,
  nodes: NetworkNode[],
  links: NetworkLink[]
): { queryPacket: SimulatedPacket; responsePacket?: SimulatedPacket; resolvedIp?: string } {
  const resolvedIp = DNS_RECORDS[domain.toLowerCase()] || '192.168.200.50';
  const dnsServerNode = nodes.find((n) => n.id === 'srv-campus') || nodes.find((n) => n.id === 'cloud-internet');

  if (!dnsServerNode) {
    return {
      queryPacket: {
        id: `dns-err-${Date.now()}`,
        timestamp: Date.now(),
        sourceNodeId: sourceNode.id,
        protocol: 'DNS',
        color: '#a855f7',
        sizeBytes: 74,
        totalLatencyMs: 0,
        layer2: { destMac: '00:50:56:01:00:01', sourceMac: sourceNode.primaryMac, etherType: '0x0800 (IPv4)' },
        layer3: { sourceIP: sourceNode.primaryIp || '0.0.0.0', destIP: '192.168.200.50', ttl: 64, protocolNumber: 17, protocolName: 'DNS' },
        layer4: { sourcePort: 54123, destPort: 53 },
        layer7: { application: 'DNS', message: `Standard query 0x3f12 A ${domain}` },
        summary: `DNS Query: No se pudo contactar al servidor DNS`,
        status: 'dropped',
        currentStepIndex: 0,
        steps: [],
        progress: 0,
      },
    };
  }

  const sourceVlan = getNodeVlan(sourceNode, nodes);
  const dnsVlan = getNodeVlan(dnsServerNode, nodes);

  const { hops: fwdHops, dropAtNodeId, dropReason } = computePathHops(sourceNode, dnsServerNode, nodes, links, 'DNS', 53);
  const steps = createPacketSteps(fwdHops, links, nodes, 'DNS', dropAtNodeId, dropReason, sourceVlan);
  const queryLatency = Number(steps.reduce((acc, s) => acc + (s.stepLatencyMs || 1.0), 0).toFixed(1));

  const queryPacket: SimulatedPacket = {
    id: `dns-query-${Date.now()}`,
    timestamp: Date.now(),
    sourceNodeId: sourceNode.id,
    destNodeId: dnsServerNode.id,
    protocol: 'DNS',
    color: '#8b5cf6', // Violet
    sizeBytes: 74,
    totalLatencyMs: queryLatency,
    layer2: {
      destMac: '00:50:56:01:00:01',
      sourceMac: sourceNode.primaryMac,
      etherType: '0x0800 (IPv4)',
      vlanId: sourceVlan,
      isTagged: true,
      tpid: '0x8100 (IEEE 802.1Q)',
      priority: 0,
    },
    layer3: {
      sourceIP: sourceNode.primaryIp || '0.0.0.0',
      destIP: dnsServerNode.primaryIp || '192.168.200.50',
      ttl: 64,
      protocolNumber: 17, // UDP
      protocolName: 'DNS',
    },
    layer4: {
      sourcePort: 52140,
      destPort: 53,
    },
    layer7: {
      application: 'DNS',
      message: `Standard query 0x7c4b A ${domain}`,
      payload: {
        queryId: '0x7c4b',
        question: `${domain}: type A, class IN`,
      },
    },
    summary: `DNS Query: ¿Cuál es la IP de ${domain}? [VLAN ${sourceVlan}]`,
    status: dropAtNodeId ? 'dropped' : 'traveling',
    currentStepIndex: 0,
    steps,
    progress: 0,
  };

  if (dropAtNodeId) {
    return { queryPacket, resolvedIp };
  }

  const { hops: revHops } = computePathHops(dnsServerNode, sourceNode, nodes, links);
  const respSteps = createPacketSteps(revHops, links, nodes, 'DNS', undefined, undefined, dnsVlan);
  const respLatency = Number(respSteps.reduce((acc, s) => acc + (s.stepLatencyMs || 1.0), 0).toFixed(1));
  const totalDnsRtt = Number((queryLatency + respLatency).toFixed(1));

  const responsePacket: SimulatedPacket = {
    id: `dns-resp-${Date.now()}`,
    timestamp: Date.now() + 600,
    sourceNodeId: dnsServerNode.id,
    destNodeId: sourceNode.id,
    protocol: 'DNS',
    color: '#10b981', // Green response
    sizeBytes: 90,
    totalLatencyMs: totalDnsRtt,
    layer2: {
      destMac: sourceNode.primaryMac,
      sourceMac: dnsServerNode.primaryMac,
      etherType: '0x0800 (IPv4)',
      vlanId: dnsVlan,
      isTagged: true,
      tpid: '0x8100 (IEEE 802.1Q)',
      priority: 0,
    },
    layer3: {
      sourceIP: dnsServerNode.primaryIp || '192.168.200.50',
      destIP: sourceNode.primaryIp || '0.0.0.0',
      ttl: 64,
      protocolNumber: 17,
      protocolName: 'DNS',
    },
    layer4: {
      sourcePort: 53,
      destPort: 52140,
    },
    layer7: {
      application: 'DNS',
      message: `Standard query response 0x7c4b A ${domain} -> ${resolvedIp} (RTT: ${totalDnsRtt}ms)`,
      payload: {
        answers: [`${domain}: type A, class IN, addr ${resolvedIp}`],
      },
    },
    summary: `DNS Response: ${domain} -> ${resolvedIp} (RTT: ${totalDnsRtt}ms) [VLAN ${dnsVlan}]`,
    status: 'traveling',
    currentStepIndex: 0,
    steps: respSteps,
    progress: 0,
  };

  return { queryPacket, responsePacket, resolvedIp };
}

// Generate HTTP Session (TCP Handshake + HTTP GET + HTTP 200 OK)
export function createHttpSimulation(
  sourceNode: NetworkNode,
  destNode: NetworkNode,
  urlPath: string,
  nodes: NetworkNode[],
  links: NetworkLink[]
): SimulatedPacket[] {
  const sourceVlan = getNodeVlan(sourceNode, nodes);
  const destVlan = getNodeVlan(destNode, nodes);

  const { hops: fwdHops, dropAtNodeId, dropReason } = computePathHops(sourceNode, destNode, nodes, links, 'HTTP', 80);
  const { hops: revHops } = computePathHops(destNode, sourceNode, nodes, links, 'HTTP', 50420);

  const fwdSteps = createPacketSteps(fwdHops, links, nodes, 'HTTP', dropAtNodeId, dropReason, sourceVlan);
  const revSteps = createPacketSteps(revHops, links, nodes, 'HTTP', undefined, undefined, destVlan);

  const fwdLatency = Number(fwdSteps.reduce((acc, s) => acc + (s.stepLatencyMs || 1.0), 0).toFixed(1));
  const revLatency = Number(revSteps.reduce((acc, s) => acc + (s.stepLatencyMs || 1.0), 0).toFixed(1));
  const httpRtt = Number((fwdLatency + revLatency).toFixed(1));

  // 1. TCP SYN
  const synPacket: SimulatedPacket = {
    id: `http-syn-${Date.now()}`,
    timestamp: Date.now(),
    sourceNodeId: sourceNode.id,
    destNodeId: destNode.id,
    protocol: 'TCP',
    color: '#ec4899', // Pink TCP
    sizeBytes: 66,
    totalLatencyMs: fwdLatency,
    layer2: {
      destMac: '00:50:56:01:00:01',
      sourceMac: sourceNode.primaryMac,
      etherType: '0x0800 (IPv4)',
      vlanId: sourceVlan,
      isTagged: true,
      tpid: '0x8100 (IEEE 802.1Q)',
      priority: 0,
    },
    layer3: { sourceIP: sourceNode.primaryIp || '0.0.0.0', destIP: destNode.primaryIp || '0.0.0.0', ttl: 64, protocolNumber: 6, protocolName: 'TCP' },
    layer4: { sourcePort: 48922, destPort: 80, flags: ['SYN'], sequenceNumber: 100 },
    layer7: { application: 'TCP', message: `48922 -> 80 [SYN] Seq=0 Win=64240 MSS=1460 (retardo: ${fwdLatency}ms)` },
    summary: `TCP Handshake: [SYN] ${sourceNode.name} -> ${destNode.name}:80 [VLAN ${sourceVlan}]`,
    status: dropAtNodeId ? 'dropped' : 'traveling',
    currentStepIndex: 0,
    steps: fwdSteps,
    progress: 0,
  };

  if (dropAtNodeId) return [synPacket];

  // 2. HTTP GET
  const getPacket: SimulatedPacket = {
    id: `http-get-${Date.now()}`,
    timestamp: Date.now() + 500,
    sourceNodeId: sourceNode.id,
    destNodeId: destNode.id,
    protocol: 'HTTP',
    color: '#f97316', // Orange HTTP
    sizeBytes: 312,
    totalLatencyMs: fwdLatency,
    layer2: {
      destMac: '00:50:56:01:00:01',
      sourceMac: sourceNode.primaryMac,
      etherType: '0x0800 (IPv4)',
      vlanId: sourceVlan,
      isTagged: true,
      tpid: '0x8100 (IEEE 802.1Q)',
      priority: 0,
    },
    layer3: { sourceIP: sourceNode.primaryIp || '0.0.0.0', destIP: destNode.primaryIp || '0.0.0.0', ttl: 64, protocolNumber: 6, protocolName: 'HTTP' },
    layer4: { sourcePort: 48922, destPort: 80, flags: ['PSH', 'ACK'], sequenceNumber: 101 },
    layer7: {
      application: 'HTTP',
      message: `GET ${urlPath || '/'} HTTP/1.1\r\nHost: ${destNode.hostname || destNode.name}`,
      payload: {
        method: 'GET',
        path: urlPath || '/',
        userAgent: 'curl/8.5.0',
        accept: '*/*',
      },
    },
    summary: `HTTP GET ${urlPath || '/'} (${destNode.hostname || destNode.name}) [VLAN ${sourceVlan}]`,
    status: 'traveling',
    currentStepIndex: 0,
    steps: fwdSteps,
    progress: 0,
  };

  // 3. HTTP 200 OK Response
  const respPacket: SimulatedPacket = {
    id: `http-resp-${Date.now()}`,
    timestamp: Date.now() + 1000,
    sourceNodeId: destNode.id,
    destNodeId: sourceNode.id,
    protocol: 'HTTP',
    color: '#059669', // Green response
    sizeBytes: 742,
    totalLatencyMs: httpRtt,
    layer2: {
      destMac: sourceNode.primaryMac,
      sourceMac: destNode.primaryMac,
      etherType: '0x0800 (IPv4)',
      vlanId: destVlan,
      isTagged: true,
      tpid: '0x8100 (IEEE 802.1Q)',
      priority: 0,
    },
    layer3: { sourceIP: destNode.primaryIp || '0.0.0.0', destIP: sourceNode.primaryIp || '0.0.0.0', ttl: 63, protocolNumber: 6, protocolName: 'HTTP' },
    layer4: { sourcePort: 80, destPort: 48922, flags: ['PSH', 'ACK'], sequenceNumber: 501 },
    layer7: {
      application: 'HTTP',
      message: `HTTP/1.1 200 OK (text/html) RTT=${httpRtt}ms`,
      payload: {
        status: 200,
        server: 'Nginx/1.24 (Academia OS)',
        contentType: 'text/html; charset=UTF-8',
        body: '<html><head><title>Campus Virtual Academia</title></head><body><h1>Bienvenido a la Academia Digital</h1><p>Recursos y Cursos disponibles en linea.</p></body></html>',
      },
    },
    summary: `HTTP/1.1 200 OK: Servidor entregando contenido web a ${sourceNode.name} (RTT: ${httpRtt}ms) [VLAN ${destVlan}]`,
    status: 'traveling',
    currentStepIndex: 0,
    steps: revSteps,
    progress: 0,
  };

  return [synPacket, getPacket, respPacket];
}

// Generate Traceroute Hop Sequences with realistic cumulative latency per hop
export function createTracerouteSimulation(
  sourceNode: NetworkNode,
  destNode: NetworkNode,
  nodes: NetworkNode[],
  links: NetworkLink[]
): SimulatedPacket[] {
  const sourceVlan = getNodeVlan(sourceNode, nodes);
  const { hops, dropAtNodeId, dropReason } = computePathHops(sourceNode, destNode, nodes, links);
  const packets: SimulatedPacket[] = [];

  // Filter router/gateway hops in path
  const routerHops = hops.filter((h) => {
    const node = nodes.find((n) => n.id === h);
    return node && (node.type === 'router' || node.type === 'cloud' || node.id === destNode.id);
  });

  routerHops.forEach((hopNodeId, index) => {
    const ttl = index + 1;
    const isDest = hopNodeId === destNode.id;
    const hopNode = nodes.find((n) => n.id === hopNodeId);

    // Hops up to this router
    const currentSubHops = hops.slice(0, hops.indexOf(hopNodeId) + 1);
    const steps = createPacketSteps(currentSubHops, links, nodes, 'ICMP', dropAtNodeId, dropReason, sourceVlan);
    const hopLatency = Number(steps.reduce((acc, s) => acc + (s.stepLatencyMs || 1.0), 0).toFixed(1));

    const pkt: SimulatedPacket = {
      id: `trace-pkt-${Date.now()}-${ttl}`,
      timestamp: Date.now() + index * 400,
      sourceNodeId: sourceNode.id,
      destNodeId: hopNodeId,
      protocol: 'ICMP',
      color: '#3b82f6', // Bright blue
      sizeBytes: 60,
      totalLatencyMs: hopLatency,
      layer2: {
        destMac: '00:50:56:01:00:01',
        sourceMac: sourceNode.primaryMac,
        etherType: '0x0800 (IPv4)',
        vlanId: sourceVlan,
        isTagged: true,
        tpid: '0x8100 (IEEE 802.1Q)',
        priority: 0,
      },
      layer3: { sourceIP: sourceNode.primaryIp || '0.0.0.0', destIP: destNode.primaryIp || '0.0.0.0', ttl: ttl, protocolNumber: 1, protocolName: 'ICMP' },
      layer4: {
        icmpType: isDest ? 'Echo Reply' : 'TTL Expired',
        sequenceNumber: ttl,
      },
      layer7: {
        application: 'ICMP',
        message: isDest
          ? `Salto ${ttl}: Destino alcanzado (${destNode.name}) tiempo=${hopLatency}ms`
          : `Salto ${ttl}: TTL expirado en router ${hopNode?.name || hopNodeId} tiempo=${hopLatency}ms`,
      },
      summary: `Traceroute TTL=${ttl} -> Salto ${ttl}: ${hopNode?.name || hopNodeId} (${hopLatency}ms) [VLAN ${sourceVlan}]`,
      status: 'traveling',
      currentStepIndex: 0,
      steps,
      progress: 0,
    };

    packets.push(pkt);
  });

  return packets;
}

// Dynamically learn MAC addresses and update Switch CAM Tables with IEEE 802.1Q VLAN IDs
export function updateSwitchMacTables(
  nodes: NetworkNode[],
  sourceNode: NetworkNode,
  destNode?: NetworkNode
): NetworkNode[] {
  const sourceVlan = getNodeVlan(sourceNode, nodes);
  const destVlan = destNode ? getNodeVlan(destNode, nodes) : undefined;

  return nodes.map((n) => {
    if (n.type !== 'switch') return n;

    // Check if sourceNode is connected to this switch
    const srcLink = sourceNode.interfaces?.find((i) => i.connectedToNodeId === n.id);
    const dstLink = destNode?.interfaces?.find((i) => i.connectedToNodeId === n.id);

    let nextMacTable = [...(n.macTable || [])];
    let changed = false;

    if (srcLink) {
      const portName = srcLink.connectedToInterface || 'port1';
      const existingIdx = nextMacTable.findIndex((m) => m.mac === sourceNode.primaryMac);
      if (existingIdx >= 0) {
        nextMacTable[existingIdx] = {
          ...nextMacTable[existingIdx],
          port: portName,
          vlan: sourceVlan,
          ageSeconds: 0,
        };
      } else {
        nextMacTable.push({
          mac: sourceNode.primaryMac,
          port: portName,
          vlan: sourceVlan,
          ageSeconds: 0,
          type: 'DYNAMIC',
        });
      }
      changed = true;
    }

    if (dstLink && destNode && destVlan) {
      const portName = dstLink.connectedToInterface || 'port2';
      const existingIdx = nextMacTable.findIndex((m) => m.mac === destNode.primaryMac);
      if (existingIdx >= 0) {
        nextMacTable[existingIdx] = {
          ...nextMacTable[existingIdx],
          port: portName,
          vlan: destVlan,
          ageSeconds: 0,
        };
      } else {
        nextMacTable.push({
          mac: destNode.primaryMac,
          port: portName,
          vlan: destVlan,
          ageSeconds: 0,
          type: 'DYNAMIC',
        });
      }
      changed = true;
    }

    return changed ? { ...n, macTable: nextMacTable } : n;
  });
}

