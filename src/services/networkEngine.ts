import {
  NetworkNode,
  NetworkLink,
  SimulatedPacket,
  PacketAnimationStep,
  ProtocolType,
  FirewallRule,
  Layer2Frame,
} from '../types/network';

// Unique packet IDs (Date.now() alone collides when several packets are created in the same ms)
let packetSeq = 0;
const newPacketId = (prefix: string) => `${prefix}-${Date.now()}-${++packetSeq}`;

// Names served by the campus DNS (SRV-Campus). It also forwards public names.
const INTERNAL_DNS_ZONE: Record<string, string> = {
  'campus.academia.edu': '192.168.200.50',
  'academia.local': '192.168.200.50',
  'moodle.academia.edu': '192.168.200.50',
  'gestion.academia.local': '192.168.100.20',
  'db.academia.local': '192.168.100.20',
};

// Names an Internet resolver (8.8.8.8) knows. Internal campus names are NOT public.
const PUBLIC_DNS_ZONE: Record<string, string> = {
  'dns.google': '8.8.8.8',
};

export const DNS_RECORDS: Record<string, string> = { ...INTERNAL_DNS_ZONE, ...PUBLIC_DNS_ZONE };

// Default access VLAN of every zone (the VLAN its gateway lives in)
const ZONE_VLAN: Record<string, number> = {
  aula1: 10,
  aula2: 20,
  aula3: 30,
  'wifi-guest': 50,
  'admin-zone1': 100,
  'admin-zone2': 200,
};

export function getZoneVlan(zone: string): number | undefined {
  return ZONE_VLAN[zone];
}

export function isValidIpv4(ip: string): boolean {
  const parts = (ip || '').trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

// Convert IPv4 string to 32-bit unsigned integer
export function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

export function isPrivateIp(ip: string): boolean {
  if (!isValidIpv4(ip)) return false;
  return (
    isIpInCidr(ip, '10.0.0.0/8') ||
    isIpInCidr(ip, '172.16.0.0/12') ||
    isIpInCidr(ip, '192.168.0.0/16') ||
    isIpInCidr(ip, '127.0.0.0/8')
  );
}

// "any", a single IP, or IP/prefix (0-32)
export function isValidCidrOrAny(value: string): boolean {
  const v = (value || '').trim().toLowerCase();
  if (v === 'any') return true;
  const [ip, prefix, ...rest] = v.split('/');
  if (rest.length > 0 || !isValidIpv4(ip)) return false;
  if (prefix === undefined) return true;
  return /^\d{1,2}$/.test(prefix) && Number(prefix) <= 32;
}

// "any" or a comma separated list of ports / ranges (0-65535)
export function isValidPortSpec(value: string): boolean {
  const v = (value || '').trim().toLowerCase();
  if (v === 'any') return true;
  return v.split(',').every((p) => {
    const part = p.trim();
    const m = part.match(/^(\d{1,5})(?:-(\d{1,5}))?$/);
    if (!m) return false;
    const a = Number(m[1]);
    const b = m[2] !== undefined ? Number(m[2]) : a;
    return a <= 65535 && b <= 65535 && a <= b;
  });
}

// Check if an IP address belongs to a CIDR range (e.g. 192.168.10.0/24, 172.16.50.15/32, or "any")
export function isIpInCidr(ip: string, cidr: string): boolean {
  if (!cidr || cidr.toLowerCase() === 'any' || cidr === '0.0.0.0/0' || cidr === '0.0.0.0') {
    return true;
  }
  if (!ip) return false;

  const cleanCidr = cidr.trim();
  const cleanIp = ip.trim();
  if (!isValidIpv4(cleanIp)) return false;

  // If exact IP match without slash
  if (!cleanCidr.includes('/')) {
    return cleanIp === cleanCidr;
  }

  const [range, prefixStr] = cleanCidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  if (!isValidIpv4(range) || isNaN(prefix) || prefix < 0 || prefix > 32) return false;
  if (prefix === 0) return true;

  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  const ipInt = ipToInt(cleanIp);
  const rangeInt = ipToInt(range);

  return ((ipInt & mask) >>> 0) === ((rangeInt & mask) >>> 0);
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

  // 3. Protocol check (ARP is layer 2: IP ACLs never see it)
  const ruleProto = (rule.protocol || 'ANY').toUpperCase();
  const pktProto = (protocol || 'ANY').toUpperCase();
  if (pktProto === 'ARP') return false;

  if (ruleProto !== 'ANY') {
    if (ruleProto === 'TCP') {
      if (pktProto !== 'TCP' && pktProto !== 'HTTP' && pktProto !== 'HTTPS' && pktProto !== 'SSH') {
        return false;
      }
    } else if (ruleProto === 'UDP') {
      if (pktProto !== 'UDP' && pktProto !== 'DNS' && pktProto !== 'DHCP') {
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

  const portMatches = (spec: string | undefined, port: number, fallback: number) => {
    if (!spec || spec === 'any') return true;
    const effectivePort = port || fallback;
    if (effectivePort <= 0) return true;
    return spec.split(',').map((p) => p.trim()).some((p) => {
      if (p.includes('-')) {
        const [min, max] = p.split('-').map(Number);
        return effectivePort >= min && effectivePort <= max;
      }
      return Number(p) === effectivePort;
    });
  };

  const wellKnown =
    pktProto === 'HTTP' ? 80 : pktProto === 'HTTPS' ? 443 : pktProto === 'DNS' ? 53 : pktProto === 'SSH' ? 22 : 0;

  // 4. Destination / source port checks (only when the rule specifies them)
  if (!portMatches(rule.destPort, destPort, wellKnown)) return false;
  if (!portMatches(rule.sourcePort, sourcePort, 0)) return false;

  return true;
}

export interface AclContext {
  ingress?: string; // interface the packet enters the router through
  egress?: string; // interface the packet leaves the router through
}

// Evaluate ACL rules on a specific router.
// Each interface/direction list is evaluated top-down, first match wins.
// Simulator policy: when no rule matches the packet is PERMITTED (on real Cisco IOS
// every ACL ends with an implicit "deny ip any any"; the exported CLI makes this explicit).
// Without context every rule is evaluated regardless of its interface.
export function evaluateRouterAcl(
  router: NetworkNode,
  sourceIp: string,
  destIp: string,
  protocol: ProtocolType | 'ANY' = 'ICMP',
  destPort: number = 0,
  sourcePort: number = 0,
  ctx?: AclContext
): { matchedRule?: FirewallRule; isAllowed: boolean; dropReason?: string; direction?: 'IN' | 'OUT' } {
  if (!router.firewallRules || router.firewallRules.length === 0) {
    return { isAllowed: true };
  }

  const activeRules = router.firewallRules
    .filter((r) => r.enabled !== false)
    .sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999));

  const applies = (rule: FirewallRule, dir: 'IN' | 'OUT', iface?: string) => {
    if ((rule.direction || 'IN') !== dir) return false;
    if (!ctx) return true;
    if (!iface) return false; // router-originated (IN) or router-destined (OUT) traffic
    const ruleIface = (rule.interfaceName || 'any').toLowerCase();
    return ruleIface === 'any' || ruleIface === iface.toLowerCase();
  };

  let lastMatch: FirewallRule | undefined;
  for (const dir of ['IN', 'OUT'] as const) {
    const iface = dir === 'IN' ? ctx?.ingress : ctx?.egress;
    for (const rule of activeRules.filter((r) => applies(r, dir, iface))) {
      if (!doesRuleMatchPacket(rule, sourceIp, destIp, protocol, destPort, sourcePort)) continue;
      if (rule.action === 'DROP') {
        return {
          matchedRule: rule,
          isAllowed: false,
          direction: dir,
          dropReason: `ACL de ${dir === 'IN' ? 'entrada' : 'salida'} en ${router.name}${iface ? ` (${iface})` : ''}: la regla [Sec ${rule.sequence ?? '-'}] "${rule.description}" deniega el tráfico (DENY).`,
        };
      }
      lastMatch = rule;
      break; // PERMIT: first match ends this list
    }
  }

  return { isAllowed: true, matchedRule: lastMatch };
}

// Check if two IPs are on the same subnet (default /24)
export function isSameSubnet(ip1: string, ip2: string, mask: string = '255.255.255.0'): boolean {
  if (!isValidIpv4(ip1) || !isValidIpv4(ip2) || !isValidIpv4(mask)) return false;
  const m = ipToInt(mask);
  return ((ipToInt(ip1) & m) >>> 0) === ((ipToInt(ip2) & m) >>> 0);
}

// Find link between two node IDs
export function findLink(links: NetworkLink[], nodeA: string, nodeB: string): NetworkLink | undefined {
  return links.find(
    (l) =>
      (l.fromNodeId === nodeA && l.toNodeId === nodeB) ||
      (l.fromNodeId === nodeB && l.toNodeId === nodeA)
  );
}

// Port name used by `nodeId` on the link towards `neighborId`
export function portTowards(links: NetworkLink[], nodeId: string, neighborId: string): string | undefined {
  const link = findLink(links, nodeId, neighborId);
  if (!link) return undefined;
  return link.fromNodeId === nodeId ? link.fromPort : link.toPort;
}

// IP of the router interface that faces `neighborId` (what traceroute shows for that hop)
export function interfaceIpTowards(node: NetworkNode, neighborId: string | undefined, links: NetworkLink[]): string {
  if (neighborId) {
    const port = portTowards(links, node.id, neighborId);
    const ip = node.interfaces.find((i) => i.name === port)?.ip;
    if (ip) return ip;
  }
  return node.primaryIp || '';
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

// Node that owns an IP (primary IP or any interface IP)
export function findNodeByIp(ip: string, nodes: NetworkNode[]): NetworkNode | undefined {
  return nodes.find((n) => n.primaryIp === ip || n.interfaces.some((i) => i.ip === ip));
}

// Resolve IP or domain name to destination Node
export function resolveTarget(target: string, nodes: NetworkNode[]): { ip: string; node?: NetworkNode; isDnsResolved: boolean } {
  const cleanTarget = target.trim().toLowerCase();

  // 1. Direct DNS lookup
  if (DNS_RECORDS[cleanTarget]) {
    const resolvedIp = DNS_RECORDS[cleanTarget];
    return { ip: resolvedIp, node: findNodeByIp(resolvedIp, nodes), isDnsResolved: true };
  }

  // 2. Direct IP match
  const nodeByIp = findNodeByIp(cleanTarget, nodes);
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

  // Fallback: raw IP not present in the topology (or an unknown name)
  return { ip: cleanTarget, node: undefined, isDnsResolved: false };
}

// Switch (or AP) a host is plugged into
export function getAccessDevice(node: NetworkNode, nodes: NetworkNode[]): NetworkNode | undefined {
  const id = node.interfaces?.[0]?.connectedToNodeId;
  const dev = id ? nodes.find((n) => n.id === id) : undefined;
  return dev && (dev.type === 'switch' || dev.type === 'ap') ? dev : undefined;
}

// Helper to get VLAN assigned to a node's interface or switch port
export function getNodeVlan(node: NetworkNode, nodes: NetworkNode[]): number {
  const connectedSwId = node.interfaces?.[0]?.connectedToNodeId;
  const connectedIfaceName = node.interfaces?.[0]?.connectedToInterface;
  if (connectedSwId) {
    const sw = nodes.find((n) => n.id === connectedSwId);
    if (sw) {
      const swPort = sw.interfaces?.find((i) => i.name === connectedIfaceName);
      if (swPort?.vlanId) return swPort.vlanId;
    }
  }
  return ZONE_VLAN[node.zone] ?? 1;
}

// Router acting as default gateway of a host
export function findGatewayRouter(node: NetworkNode, nodes: NetworkNode[]): NetworkNode | undefined {
  if (node.type === 'router') return node;
  const gw = node.gateway || node.interfaces?.[0]?.gateway;
  return gw ? nodes.find((n) => n.type === 'router' && n.interfaces.some((i) => i.ip === gw)) : undefined;
}

function gatewayMac(node: NetworkNode, nodes: NetworkNode[]): string {
  const gw = node.gateway || node.interfaces?.[0]?.gateway;
  const router = findGatewayRouter(node, nodes);
  return router?.interfaces.find((i) => i.ip === gw)?.mac || router?.primaryMac || '00:00:00:00:00:00';
}

// Physical path (BFS over cabling, regardless of link state)
export function findPhysicalPath(srcId: string, dstId: string, links: NetworkLink[]): string[] | null {
  if (srcId === dstId) return [srcId];
  const adjacency = new Map<string, string[]>();
  for (const l of links) {
    adjacency.set(l.fromNodeId, [...(adjacency.get(l.fromNodeId) || []), l.toNodeId]);
    adjacency.set(l.toNodeId, [...(adjacency.get(l.toNodeId) || []), l.fromNodeId]);
  }
  const prev = new Map<string, string>();
  const queue = [srcId];
  const seen = new Set([srcId]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adjacency.get(cur) || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, cur);
      if (next === dstId) {
        const path = [dstId];
        let p = dstId;
        while (prev.has(p)) {
          p = prev.get(p)!;
          path.unshift(p);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

// Routers that FORWARD the packet (intermediate hops) - each one decrements the TTL
export function forwardingRouters(hops: string[], nodes: NetworkNode[]): string[] {
  return hops.slice(1, -1).filter((id) => nodes.find((n) => n.id === id)?.type === 'router');
}

export type DropKind = 'acl' | 'link' | 'route' | 'vlan' | 'nopath';

export interface PathResult {
  hops: string[];
  dropAtNodeId?: string;
  dropReason?: string;
  dropKind?: DropKind;
}

// Calculate the network hops from source node to destination node, applying (in order along the
// path) physical link state, IEEE 802.1Q access VLANs and router ACLs.
export function computePathHops(
  sourceNode: NetworkNode,
  destNode: NetworkNode,
  nodes: NetworkNode[],
  links: NetworkLink[],
  protocol: ProtocolType | 'ANY' = 'ICMP',
  destPort: number = 0,
  sourcePort: number = 0,
  ips: { srcIp?: string; dstIp?: string } = {}
): PathResult {
  if (sourceNode.id === destNode.id) {
    return { hops: [sourceNode.id] };
  }

  const path = findPhysicalPath(sourceNode.id, destNode.id, links);
  if (!path) {
    return {
      hops: [sourceNode.id],
      dropAtNodeId: sourceNode.id,
      dropKind: 'nopath',
      dropReason: `No existe ningún camino físico entre ${sourceNode.name} y ${destNode.name}.`,
    };
  }

  const byId = (id: string) => nodes.find((n) => n.id === id);
  const srcIp = ips.srcIp || sourceNode.primaryIp || '';
  const dstIp = ips.dstIp || destNode.primaryIp || '';
  const routed = path.some((id) => byId(id)?.type === 'router');
  const srcVlan = getNodeVlan(sourceNode, nodes);
  const dstVlan = getNodeVlan(destNode, nodes);
  const srcAccess = getAccessDevice(sourceNode, nodes);
  const dstAccess = getAccessDevice(destNode, nodes);
  const srcZoneVlan = getZoneVlan(sourceNode.zone);
  const dstZoneVlan = getZoneVlan(destNode.zone);

  const stopAt = (i: number, kind: DropKind, reason: string): PathResult => ({
    hops: path.slice(0, i + 1),
    dropAtNodeId: path[i],
    dropKind: kind,
    dropReason: reason,
  });

  for (let i = 1; i < path.length; i++) {
    const prev = byId(path[i - 1]);
    const cur = byId(path[i]);
    if (!prev || !cur) continue;

    // 1. Physical layer
    const link = findLink(links, prev.id, cur.id);
    if (link && link.status === 'down') {
      const isRouterUplink = prev.type === 'router' && (cur.type === 'router' || cur.type === 'cloud');
      if (isRouterUplink && i - 1 > 0) {
        const mode = link.id === 'link-trunk-routers' ? ' (modo redes independientes)' : '';
        return stopAt(
          i - 1,
          'route',
          `Red inalcanzable${mode}: el enlace ${link.fromPort}↔${link.toPort} entre ${prev.name} y ${cur.name} está caído, así que ${prev.name} no tiene ninguna ruta activa hacia ${dstIp} (ICMP Destination Net Unreachable).`
        );
      }
      return stopAt(
        i,
        'link',
        `Fallo físico de enlace: el cable entre ${prev.name} y ${cur.name} está desconectado (LINK DOWN). La trama se pierde.`
      );
    }

    // 2. IEEE 802.1Q at the access switches
    if (cur.type === 'switch') {
      if (i === 1 && srcAccess?.id === cur.id) {
        if (!routed && srcVlan !== dstVlan) {
          return stopAt(
            i,
            'vlan',
            `Aislamiento L2 IEEE 802.1Q: en ${cur.name} el puerto de ${sourceNode.name} está en la VLAN ${srcVlan} y el de ${destNode.name} en la VLAN ${dstVlan}. Son dominios de difusión distintos en el mismo switch físico: el ARP nunca llega al otro equipo.`
          );
        }
        if (routed && srcZoneVlan !== undefined && srcVlan !== srcZoneVlan) {
          return stopAt(
            i,
            'vlan',
            `Aislamiento L2 IEEE 802.1Q: el puerto de ${sourceNode.name} está en la VLAN ${srcVlan}, pero su puerta de enlace (${sourceNode.gateway || 'gateway'}) está en la VLAN ${srcZoneVlan}. El ARP hacia el gateway no sale de la VLAN ${srcVlan} y el paquete no puede enrutarse.`
          );
        }
      }
      if (routed && i === path.length - 2 && dstAccess?.id === cur.id && dstZoneVlan !== undefined && dstVlan !== dstZoneVlan) {
        return stopAt(
          i,
          'vlan',
          `Aislamiento L2 IEEE 802.1Q: el puerto de ${destNode.name} en ${cur.name} está en la VLAN ${dstVlan}, pero el router busca ${dstIp} en la VLAN ${dstZoneVlan}. Nadie responde a su ARP y el paquete se descarta.`
        );
      }
    }

    // 3. Router ACLs (ingress interface = towards previous hop, egress = towards next hop)
    if (cur.type === 'router' && protocol !== 'ARP') {
      const ingress = portTowards(links, cur.id, prev.id);
      const egress = i < path.length - 1 ? portTowards(links, cur.id, path[i + 1]) : undefined;
      const acl = evaluateRouterAcl(cur, srcIp, dstIp, protocol, destPort, sourcePort, { ingress, egress });
      if (!acl.isAllowed) {
        return stopAt(i, 'acl', acl.dropReason || `Tráfico denegado por ACL en ${cur.name}.`);
      }
    }
  }

  return { hops: path };
}

// Build animation steps with detailed educational explanations, IEEE 802.1Q tags, and latency
export function createPacketSteps(
  hops: string[],
  links: NetworkLink[],
  nodes: NetworkNode[],
  protocol: ProtocolType,
  dropAtNodeId?: string,
  dropReason?: string,
  vlanId?: number,
  destVlanId?: number
): PacketAnimationStep[] {
  const steps: PacketAnimationStep[] = [];
  let vid = vlanId || 1;

  for (let i = 0; i < hops.length - 1; i++) {
    const fromId = hops[i];
    const toId = hops[i + 1];
    const link = findLink(links, fromId, toId);
    const linkId = link ? link.id : `${fromId}-${toId}`;

    const fromNode = nodes.find((n) => n.id === fromId);
    const toNode = nodes.find((n) => n.id === toId);

    const fromName = fromNode ? fromNode.name : fromId;
    const toName = toNode ? toNode.name : toId;

    // After crossing a router the frame belongs to the destination VLAN
    if (fromNode?.type === 'router' && destVlanId) vid = destVlanId;

    const isLinkDown = link?.status === 'down';
    const isDropped = toId === dropAtNodeId || isLinkDown;
    const finalDropReason = isLinkDown
      ? `Fallo físico de enlace: El enlace entre ${fromName} y ${toName} está desconectado (LINK DOWN).`
      : dropReason;

    // Determine latency for this physical link
    const stepLatencyMs = link ? (link.currentLatency || link.latency || 1.0) : 1.0;
    let explanation = '';

    if (isLinkDown) {
      explanation = `[ENLACE CAÍDO] Trama descartada: El enlace físico entre ${fromName} y ${toName} se encuentra en estado DOWN.`;
    } else if ((fromNode?.type === 'pc' || fromNode?.type === 'server') && toNode?.type === 'switch') {
      explanation = `${fromName} transmite la trama Ethernet estándar (sin etiquetar) al puerto de acceso del switch ${toName} (VLAN ${vid}, retardo enlace: ${stepLatencyMs}ms).`;
    } else if (fromNode?.type === 'switch' && (toNode?.type === 'pc' || toNode?.type === 'server')) {
      explanation = `Switch ${fromName} retira la etiqueta 802.1Q (Untagged) y conmuta la trama en Capa 2 hacia el puerto de acceso de ${toName} (${stepLatencyMs}ms).`;
    } else if (fromNode?.type === 'switch' && toNode?.type === 'router') {
      explanation = `Switch ${fromName} inserta cabecera IEEE 802.1Q [VLAN ${vid}, TPID 0x8100] por el enlace troncal hacia el Gateway ${toName} (${stepLatencyMs}ms).`;
    } else if (fromNode?.type === 'router' && toNode?.type === 'router') {
      explanation = `Enlace troncal P2P: ${fromName} decrementa el TTL y reenvía el paquete por la red 10.0.0.0/30 hacia el siguiente router ${toName} (troncal 10G, ${stepLatencyMs}ms).`;
    } else if (fromNode?.type === 'router' && toNode?.type === 'switch') {
      explanation = `Router ${fromName} decrementa el TTL, recalcula el checksum y envía la trama etiquetada (802.1Q VLAN ${vid}) hacia el switch ${toName} (${stepLatencyMs}ms).`;
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

const sumLatency = (steps: PacketAnimationStep[]) =>
  Number(steps.reduce((acc, s) => acc + (s.stepLatencyMs || 1.0), 0).toFixed(1));

// Latency the same steps would have on idle links (nominal value of each link)
const nominalLatency = (steps: PacketAnimationStep[], links: NetworkLink[]) =>
  steps.reduce((acc, s) => acc + (links.find((l) => l.id === s.linkId)?.latency || 1.0), 0);

export const packetWillDrop = (pkt: SimulatedPacket) => pkt.steps.some((s) => s.isDropped);

const tagged = (vlanId: number): Partial<Layer2Frame> => ({
  vlanId,
  isTagged: true,
  tpid: '0x8100 (IEEE 802.1Q)',
  priority: 0,
});

const baseState = { status: 'traveling' as const, currentStepIndex: 0, progress: 0 };

export type PingOutcome = 'reply' | 'unreachable' | 'filtered' | 'timeout' | 'ttl-exceeded';

// Generate an ICMP Echo Request / Reply pair with realistic fluctuating latency and TTL handling
export function createPingSimulation(
  sourceNode: NetworkNode,
  destIp: string,
  nodes: NetworkNode[],
  links: NetworkLink[],
  seq: number = 1,
  ttl: number = 64
): { requestPacket: SimulatedPacket; replyPacket?: SimulatedPacket; logMessage: string; rtt: number; outcome: PingOutcome } {
  const destInfo = resolveTarget(destIp, nodes);
  const destNode = destInfo.node;
  const targetIp = destInfo.ip;
  const srcIp = sourceNode.primaryIp || '0.0.0.0';
  const srcVlan = getNodeVlan(sourceNode, nodes);
  const srcMask = sourceNode.interfaces.find((i) => i.ip === srcIp)?.subnetMask || '255.255.255.0';
  const isLocal = isSameSubnet(srcIp, targetIp, srcMask);
  const startTtl = Math.max(1, Math.min(255, Math.round(ttl)));

  const makeRequest = (steps: PacketAnimationStep[], destNodeId: string | undefined, destMac: string, summary: string): SimulatedPacket => ({
    id: newPacketId('pkt-req'),
    timestamp: Date.now(),
    sourceNodeId: sourceNode.id,
    destNodeId,
    protocol: 'ICMP',
    color: '#0284c7',
    sizeBytes: 98,
    totalLatencyMs: sumLatency(steps),
    layer2: { destMac, sourceMac: sourceNode.primaryMac, etherType: '0x0800 (IPv4)', ...tagged(srcVlan) },
    layer3: { sourceIP: srcIp, destIP: targetIp, ttl: startTtl, protocolNumber: 1, protocolName: 'ICMP' },
    layer4: { icmpType: 'Echo Request', sequenceNumber: seq },
    layer7: {
      application: 'ICMP',
      message: `Echo (ping) request seq=${seq} ttl=${startTtl} payload=56 bytes`,
      payload: { data: 'abcdefghijklmnopqrstuvwabcdefghi' },
    },
    summary,
    ...baseState,
    steps,
  });

  // ---- Destination not present in the topology ----
  if (!destNode) {
    let hops: string[] = [sourceNode.id];
    let dropAt = sourceNode.id;
    let reason = '';
    let outcome: PingOutcome = 'unreachable';
    let logMessage = `From ${srcIp} icmp_seq=${seq} Destination Host Unreachable`;

    if (isLocal) {
      const access = getAccessDevice(sourceNode, nodes);
      if (access) {
        hops = [sourceNode.id, access.id];
        dropAt = access.id;
      }
      reason = `Nadie responde al ARP «¿Quién tiene ${targetIp}?»: no hay ningún equipo con esa IP en la subred.`;
    } else {
      const internet = nodes.find((n) => n.type === 'cloud');
      const gateway = findGatewayRouter(sourceNode, nodes);
      const goesToInternet = !isPrivateIp(targetIp) && !!internet;
      const target = goesToInternet ? internet : gateway;
      const res = target
        ? computePathHops(sourceNode, target, nodes, links, 'ICMP', 0, 0, { dstIp: targetIp })
        : { hops: [sourceNode.id] as string[] };
      hops = res.hops;
      dropAt = res.dropAtNodeId || hops[hops.length - 1];
      if (res.dropAtNodeId) {
        reason = res.dropReason || '';
        outcome = res.dropKind === 'acl' ? 'filtered' : res.dropKind === 'link' ? 'timeout' : 'unreachable';
      } else if (goesToInternet) {
        reason = `${targetIp} no existe en esta simulación: el paquete sale a Internet y nunca recibe respuesta.`;
        outcome = 'timeout';
      } else {
        reason = `${gateway?.name || 'El router'} no tiene ninguna red que contenga ${targetIp}: Destination Host Unreachable.`;
        logMessage = `From ${sourceNode.gateway || srcIp} icmp_seq=${seq} Destination Host Unreachable`;
      }
      if (outcome === 'timeout') logMessage = `Tiempo de espera agotado para icmp_seq=${seq}`;
      if (outcome === 'filtered') logMessage = `From ${sourceNode.gateway || srcIp} icmp_seq=${seq} Destination Host Administratively Prohibited (ACL)`;
    }

    const steps = createPacketSteps(hops, links, nodes, 'ICMP', dropAt, reason, srcVlan);
    const req = makeRequest(
      steps,
      undefined,
      isLocal ? 'FF:FF:FF:FF:FF:FF' : gatewayMac(sourceNode, nodes),
      `ICMP Echo Request a ${targetIp} (host inexistente o fuera de la simulación)`
    );
    return { requestPacket: req, logMessage, rtt: 0, outcome };
  }

  // ---- Forward path ----
  const destVlan = getNodeVlan(destNode, nodes);
  const fwd = computePathHops(sourceNode, destNode, nodes, links, 'ICMP', 0, 0, { dstIp: targetIp });
  let fwdHops = fwd.hops;
  let dropAtNodeId = fwd.dropAtNodeId;
  let dropReason = fwd.dropReason;

  // TTL expiry: the n-th forwarding router discards a packet that arrives with TTL = 1
  // (a router that drops the packet by ACL never forwards it, so it does not count)
  const routersOnPath = forwardingRouters(fwdHops, nodes);
  let expiredAt: NetworkNode | undefined;
  if (startTtl <= routersOnPath.length) {
    const routerId = routersOnPath[startTtl - 1];
    expiredAt = nodes.find((n) => n.id === routerId);
    fwdHops = fwdHops.slice(0, fwdHops.indexOf(routerId) + 1);
    dropAtNodeId = routerId;
    dropReason = `TTL agotado: ${expiredAt?.name} decrementa el TTL a 0, descarta el paquete y envía un ICMP Time Exceeded (tipo 11) a ${sourceNode.name}.`;
  }

  const reqSteps = createPacketSteps(fwdHops, links, nodes, 'ICMP', dropAtNodeId, dropReason, srcVlan, destVlan);
  const reqLatency = sumLatency(reqSteps);
  const destMac = isLocal ? destNode.primaryMac : gatewayMac(sourceNode, nodes);
  const requestPacket = makeRequest(
    reqSteps,
    destNode.id,
    destMac,
    `ICMP Echo Request: ${sourceNode.name} (${srcIp}) -> ${destNode.name} (${targetIp}) TTL=${startTtl} [VLAN ${srcVlan}]`
  );

  // ---- TTL exceeded: ICMP Time Exceeded travels back from the router ----
  if (expiredAt) {
    const prevHop = fwdHops[fwdHops.length - 2];
    const routerIp = interfaceIpTowards(expiredAt, prevHop, links);
    const back = computePathHops(expiredAt, sourceNode, nodes, links, 'ICMP', 0, 0, { srcIp: routerIp });
    const backSteps = createPacketSteps(back.hops, links, nodes, 'ICMP', back.dropAtNodeId, back.dropReason, destVlan, srcVlan);
    const rtt = Number((reqLatency + sumLatency(backSteps)).toFixed(1));
    const replyPacket: SimulatedPacket = {
      id: newPacketId('pkt-ttl'),
      timestamp: Date.now() + 300,
      sourceNodeId: expiredAt.id,
      destNodeId: sourceNode.id,
      protocol: 'ICMP',
      color: '#f59e0b',
      sizeBytes: 70,
      totalLatencyMs: rtt,
      layer2: { destMac: sourceNode.primaryMac, sourceMac: expiredAt.primaryMac, etherType: '0x0800 (IPv4)', ...tagged(srcVlan) },
      layer3: { sourceIP: routerIp, destIP: srcIp, ttl: 64 - forwardingRouters(back.hops, nodes).length, protocolNumber: 1, protocolName: 'ICMP' },
      layer4: { icmpType: 'TTL Expired', sequenceNumber: seq },
      layer7: { application: 'ICMP', message: `Time-to-live exceeded (Time to live exceeded in transit) desde ${routerIp}` },
      summary: `ICMP Time Exceeded: ${expiredAt.name} (${routerIp}) -> ${sourceNode.name}: el TTL=${startTtl} se agotó en tránsito`,
      ...baseState,
      steps: backSteps,
    };
    return {
      requestPacket,
      replyPacket,
      logMessage: `From ${routerIp} icmp_seq=${seq} Time to live exceeded`,
      rtt,
      outcome: 'ttl-exceeded',
    };
  }

  // ---- Forward drop (ACL, link, VLAN, routing) ----
  if (dropAtNodeId) {
    const dropNode = nodes.find((n) => n.id === dropAtNodeId);
    const prevHop = fwdHops[fwdHops.length - 2];
    const dropIp = dropNode ? interfaceIpTowards(dropNode, prevHop, links) : srcIp;
    let logMessage: string;
    let outcome: PingOutcome;
    switch (fwd.dropKind) {
      case 'acl':
        outcome = 'filtered';
        logMessage = `From ${dropIp} icmp_seq=${seq} Destination Host Administratively Prohibited — ${dropReason}`;
        break;
      case 'route':
        outcome = 'unreachable';
        logMessage = `From ${dropIp} icmp_seq=${seq} Destination Net Unreachable — ${dropReason}`;
        break;
      case 'vlan':
      case 'nopath':
        outcome = 'unreachable';
        logMessage = `From ${srcIp} icmp_seq=${seq} Destination Host Unreachable — ${dropReason}`;
        break;
      default:
        outcome = 'timeout';
        logMessage = `Tiempo de espera agotado para icmp_seq=${seq} — ${dropReason}`;
    }
    return { requestPacket, logMessage, rtt: 0, outcome };
  }

  // ---- Reverse path (Echo Reply). Stateless ACLs also filter the reply ----
  const rev = computePathHops(destNode, sourceNode, nodes, links, 'ICMP', 0, 0, { srcIp: targetIp, dstIp: srcIp });
  const repSteps = createPacketSteps(rev.hops, links, nodes, 'ICMP', rev.dropAtNodeId, rev.dropReason, destVlan, srcVlan);
  const microJitter = Math.random() * 0.4 - 0.2;
  const calculatedRtt = Math.max(0.8, Number((reqLatency + sumLatency(repSteps) + microJitter).toFixed(1)));
  const replyTtl = 64 - forwardingRouters(rev.hops, nodes).length;
  // Congested = clearly above what the same path costs on idle links (queueing delay)
  const congested = calculatedRtt > (nominalLatency(reqSteps, links) + nominalLatency(repSteps, links)) * 1.5 + 2;

  requestPacket.totalLatencyMs = calculatedRtt;

  const replyPacket: SimulatedPacket = {
    id: newPacketId('pkt-rep'),
    timestamp: Date.now() + 500,
    sourceNodeId: destNode.id,
    destNodeId: sourceNode.id,
    protocol: 'ICMP',
    color: '#059669',
    sizeBytes: 98,
    totalLatencyMs: calculatedRtt,
    layer2: { destMac: sourceNode.primaryMac, sourceMac: destNode.primaryMac, etherType: '0x0800 (IPv4)', ...tagged(destVlan) },
    layer3: { sourceIP: targetIp, destIP: srcIp, ttl: replyTtl, protocolNumber: 1, protocolName: 'ICMP' },
    layer4: { icmpType: 'Echo Reply', sequenceNumber: seq },
    layer7: {
      application: 'ICMP',
      message: `Echo (ping) reply seq=${seq} ttl=${replyTtl} time=${calculatedRtt.toFixed(1)}ms${congested ? ' (alta latencia/congestión)' : ''}`,
    },
    summary: rev.dropAtNodeId
      ? `ICMP Echo Reply: ${destNode.name} -> ${sourceNode.name} (descartado en el camino de vuelta) [VLAN ${destVlan}]`
      : `ICMP Echo Reply: ${destNode.name} -> ${sourceNode.name} (Éxito, ${calculatedRtt.toFixed(1)}ms) [VLAN ${destVlan}]`,
    ...baseState,
    steps: repSteps,
  };

  if (rev.dropAtNodeId) {
    const dropName = nodes.find((n) => n.id === rev.dropAtNodeId)?.name || rev.dropAtNodeId;
    return {
      requestPacket,
      replyPacket,
      logMessage: `Tiempo de espera agotado para icmp_seq=${seq} — el Echo Request llegó, pero la respuesta se descartó en ${dropName}: ${rev.dropReason}`,
      rtt: 0,
      outcome: 'timeout',
    };
  }

  return {
    requestPacket,
    replyPacket,
    logMessage: `64 bytes from ${targetIp}: icmp_seq=${seq} ttl=${replyTtl} time=${calculatedRtt.toFixed(2)} ms${congested ? ' (congestión: colas en los enlaces)' : ''}`,
    rtt: calculatedRtt,
    outcome: 'reply',
  };
}

// Generate ARP Request (broadcast) and ARP Reply (unicast) inside the local broadcast domain
export function createArpResolution(
  sourceNode: NetworkNode,
  targetIp: string,
  nodes: NetworkNode[],
  links: NetworkLink[]
): { arpBroadcast: SimulatedPacket; arpReply?: SimulatedPacket } {
  const sourceVlan = getNodeVlan(sourceNode, nodes);
  const srcIp = sourceNode.primaryIp || '0.0.0.0';
  const access = getAccessDevice(sourceNode, nodes);

  const broadcastSteps: PacketAnimationStep[] = [];
  if (access) {
    const link = findLink(links, sourceNode.id, access.id);
    const lat = link ? link.currentLatency || link.latency || 1.0 : 1.0;
    const down = link?.status === 'down';
    broadcastSteps.push({
      fromNodeId: sourceNode.id,
      toNodeId: access.id,
      linkId: link?.id || `${sourceNode.id}-${access.id}`,
      explanation: down
        ? `[ENLACE CAÍDO] El ARP Request no sale de ${sourceNode.name}: su cable está desconectado.`
        : `ARP Request Broadcast: ${sourceNode.name} pregunta «¿Quién tiene ${targetIp}? Díselo a ${srcIp}». ${access.name} inunda la trama por todos los puertos de la VLAN ${sourceVlan} (${lat}ms).`,
      isBroadcast: true,
      isDropped: down,
      dropReason: down ? 'Enlace caído (LINK DOWN).' : undefined,
      stepLatencyMs: lat,
    });
  }

  const arpBroadcast: SimulatedPacket = {
    id: newPacketId('arp-req'),
    timestamp: Date.now(),
    sourceNodeId: sourceNode.id,
    protocol: 'ARP',
    color: '#eab308',
    sizeBytes: 42,
    totalLatencyMs: sumLatency(broadcastSteps),
    layer2: { destMac: 'FF:FF:FF:FF:FF:FF', sourceMac: sourceNode.primaryMac, etherType: '0x0806 (ARP)', ...tagged(sourceVlan) },
    layer3: { sourceIP: srcIp, destIP: targetIp, ttl: 1, protocolNumber: 0, protocolName: 'ARP' },
    layer4: {},
    layer7: {
      application: 'ARP',
      message: `Who has ${targetIp}? Tell ${srcIp}`,
      payload: {
        hardwareType: 'Ethernet (1)',
        protocolType: 'IPv4 (0x0800)',
        opcode: 'Request (1)',
        senderMac: sourceNode.primaryMac,
        senderIp: srcIp,
        targetMac: '00:00:00:00:00:00',
        targetIp,
      },
    },
    summary: `ARP Request (Broadcast): ¿Quién tiene ${targetIp}? [VLAN ${sourceVlan}]`,
    ...baseState,
    steps: broadcastSteps,
  };

  const owner = findNodeByIp(targetIp, nodes);
  if (!owner || owner.id === sourceNode.id) return { arpBroadcast };

  // The owner only answers if it shares the broadcast domain (same L2 segment and VLAN)
  const path = computePathHops(sourceNode, owner, nodes, links, 'ARP');
  const routersInside = forwardingRouters(path.hops, nodes).length;
  if (path.dropAtNodeId || routersInside > 0 || path.hops.length > 3) return { arpBroadcast };

  const ownerMac = owner.interfaces.find((i) => i.ip === targetIp)?.mac || owner.primaryMac;
  const replySteps = createPacketSteps([...path.hops].reverse(), links, nodes, 'ARP', undefined, undefined, sourceVlan).map((s, idx) =>
    idx === 0
      ? { ...s, explanation: `ARP Reply (Unicast): ${owner.name} responde «${targetIp} está en ${ownerMac}» [VLAN ${sourceVlan}] (${s.stepLatencyMs}ms).` }
      : s
  );

  const arpReply: SimulatedPacket = {
    id: newPacketId('arp-rep'),
    timestamp: Date.now() + 400,
    sourceNodeId: owner.id,
    destNodeId: sourceNode.id,
    protocol: 'ARP',
    color: '#10b981',
    sizeBytes: 42,
    totalLatencyMs: sumLatency(replySteps),
    layer2: { destMac: sourceNode.primaryMac, sourceMac: ownerMac, etherType: '0x0806 (ARP)', ...tagged(sourceVlan) },
    layer3: { sourceIP: targetIp, destIP: srcIp, ttl: 1, protocolNumber: 0, protocolName: 'ARP' },
    layer4: {},
    layer7: {
      application: 'ARP',
      message: `${targetIp} is at ${ownerMac}`,
      payload: {
        hardwareType: 'Ethernet (1)',
        protocolType: 'IPv4 (0x0800)',
        opcode: 'Reply (2)',
        senderMac: ownerMac,
        senderIp: targetIp,
        targetMac: sourceNode.primaryMac,
        targetIp: srcIp,
      },
    },
    summary: `ARP Reply (Unicast): ${targetIp} está en ${ownerMac}`,
    ...baseState,
    steps: replySteps,
  };

  return { arpBroadcast, arpReply };
}

export type DnsOutcome = 'ok' | 'nxdomain' | 'timeout';

// Generate DNS Query and Response against the resolver configured on the host
export function createDnsSimulation(
  sourceNode: NetworkNode,
  domain: string,
  nodes: NetworkNode[],
  links: NetworkLink[]
): { queryPacket: SimulatedPacket; responsePacket?: SimulatedPacket; resolvedIp?: string; outcome: DnsOutcome; serverIp: string; dropReason?: string } {
  const name = domain.trim().toLowerCase().replace(/\.$/, '');
  const serverIp = sourceNode.dnsServer || '192.168.200.50';
  const dnsServerNode = findNodeByIp(serverIp, nodes);
  const srcIp = sourceNode.primaryIp || '0.0.0.0';
  const sourceVlan = getNodeVlan(sourceNode, nodes);
  const clientPort = 52140 + (packetSeq % 1000);
  const queryId = `0x${(0x7c4b + packetSeq).toString(16).slice(-4)}`;

  const makeQuery = (steps: PacketAnimationStep[]): SimulatedPacket => ({
    id: newPacketId('dns-query'),
    timestamp: Date.now(),
    sourceNodeId: sourceNode.id,
    destNodeId: dnsServerNode?.id,
    protocol: 'DNS',
    color: '#8b5cf6',
    sizeBytes: 74,
    totalLatencyMs: sumLatency(steps),
    layer2: {
      destMac: isSameSubnet(srcIp, serverIp) && dnsServerNode ? dnsServerNode.primaryMac : gatewayMac(sourceNode, nodes),
      sourceMac: sourceNode.primaryMac,
      etherType: '0x0800 (IPv4)',
      ...tagged(sourceVlan),
    },
    layer3: { sourceIP: srcIp, destIP: serverIp, ttl: 64, protocolNumber: 17, protocolName: 'DNS' },
    layer4: { sourcePort: clientPort, destPort: 53 },
    layer7: {
      application: 'DNS',
      message: `Standard query ${queryId} A ${name}`,
      payload: { queryId, question: `${name}: type A, class IN` },
    },
    summary: `DNS Query a ${serverIp}: ¿Cuál es la IP de ${name}? [VLAN ${sourceVlan}]`,
    ...baseState,
    steps,
  });

  if (!dnsServerNode) {
    return { queryPacket: makeQuery([]), outcome: 'timeout', serverIp, dropReason: `El servidor DNS ${serverIp} no existe en la topología.` };
  }

  const dnsVlan = getNodeVlan(dnsServerNode, nodes);
  const fwd = computePathHops(sourceNode, dnsServerNode, nodes, links, 'DNS', 53, clientPort);
  const steps = createPacketSteps(fwd.hops, links, nodes, 'DNS', fwd.dropAtNodeId, fwd.dropReason, sourceVlan, dnsVlan);
  const queryPacket = makeQuery(steps);

  if (fwd.dropAtNodeId) {
    return { queryPacket, outcome: 'timeout', serverIp, dropReason: fwd.dropReason };
  }

  // SRV-Campus knows the campus zone and forwards public names; an Internet resolver only knows public names
  const zone = dnsServerNode.type === 'cloud' ? PUBLIC_DNS_ZONE : DNS_RECORDS;
  const resolvedIp = zone[name];

  const rev = computePathHops(dnsServerNode, sourceNode, nodes, links, 'DNS', clientPort, 53);
  const respSteps = createPacketSteps(rev.hops, links, nodes, 'DNS', rev.dropAtNodeId, rev.dropReason, dnsVlan, sourceVlan);
  const totalDnsRtt = Number((queryPacket.totalLatencyMs! + sumLatency(respSteps)).toFixed(1));

  const responsePacket: SimulatedPacket = {
    id: newPacketId('dns-resp'),
    timestamp: Date.now() + 600,
    sourceNodeId: dnsServerNode.id,
    destNodeId: sourceNode.id,
    protocol: 'DNS',
    color: resolvedIp ? '#10b981' : '#f43f5e',
    sizeBytes: resolvedIp ? 90 : 74,
    totalLatencyMs: totalDnsRtt,
    layer2: { destMac: sourceNode.primaryMac, sourceMac: dnsServerNode.primaryMac, etherType: '0x0800 (IPv4)', ...tagged(dnsVlan) },
    layer3: { sourceIP: serverIp, destIP: srcIp, ttl: 64 - forwardingRouters(rev.hops, nodes).length, protocolNumber: 17, protocolName: 'DNS' },
    layer4: { sourcePort: 53, destPort: clientPort },
    layer7: {
      application: 'DNS',
      message: resolvedIp
        ? `Standard query response ${queryId} A ${name} -> ${resolvedIp} (RTT: ${totalDnsRtt}ms)`
        : `Standard query response ${queryId} No such name A ${name} (NXDOMAIN)`,
      payload: resolvedIp ? { answers: [`${name}: type A, class IN, addr ${resolvedIp}`] } : { rcode: 'NXDOMAIN (3)', answers: [] },
    },
    summary: resolvedIp
      ? `DNS Response: ${name} -> ${resolvedIp} (RTT: ${totalDnsRtt}ms) [VLAN ${dnsVlan}]`
      : `DNS Response: ${name} no existe (NXDOMAIN) [VLAN ${dnsVlan}]`,
    ...baseState,
    steps: respSteps,
  };

  if (rev.dropAtNodeId) {
    return { queryPacket, responsePacket, outcome: 'timeout', serverIp, dropReason: rev.dropReason };
  }

  return { queryPacket, responsePacket, resolvedIp, outcome: resolvedIp ? 'ok' : 'nxdomain', serverIp };
}

// Simulated services: what answers on each TCP port
const WEB_PAGES: Record<string, { server: string; html: string }> = {
  'srv-campus': {
    server: 'nginx/1.24 (Academia OS)',
    html: `<!DOCTYPE html>
<html>
<head>
  <title>Campus Virtual Academia</title>
</head>
<body>
  <h1>Bienvenido a la Academia Digital</h1>
  <p>Acceso a cursos de Redes, Ciberseguridad y Desarrollo.</p>
</body>
</html>`,
  },
  'srv-gestion': {
    server: 'Apache/2.4 (ERP Secretaría)',
    html: `<!DOCTYPE html>
<html>
<head>
  <title>ERP Secretaría · Acceso restringido</title>
</head>
<body>
  <h1>Gestión Académica</h1>
  <form action="/login" method="post">Usuario y contraseña del personal de secretaría</form>
</body>
</html>`,
  },
  'cloud-internet': {
    server: 'scaffolding on HTTPServer2',
    html: `<!DOCTYPE html>
<html>
<head>
  <title>Google Public DNS</title>
</head>
<body>
  <h1>dns.google</h1>
  <p>Resolver DNS público (8.8.8.8 / 8.8.4.4).</p>
</body>
</html>`,
  },
};

const OPEN_PORTS: Record<string, number[]> = {
  'srv-campus': [53, 80, 443],
  'srv-gestion': [80, 1521],
  'cloud-internet': [53, 80, 443],
};

export type HttpOutcome = 'ok' | 'refused' | 'timeout' | 'not-http';

// Generate an HTTP session: TCP 3-way handshake + GET + response (or RST if the port is closed)
export function createHttpSimulation(
  sourceNode: NetworkNode,
  destNode: NetworkNode,
  urlPath: string,
  nodes: NetworkNode[],
  links: NetworkLink[],
  port: number = 80,
  destIp?: string
): { packets: SimulatedPacket[]; outcome: HttpOutcome; html?: string; dropReason?: string } {
  const sourceVlan = getNodeVlan(sourceNode, nodes);
  const destVlan = getNodeVlan(destNode, nodes);
  const srcIp = sourceNode.primaryIp || '0.0.0.0';
  const dstIp = destIp || destNode.primaryIp || '0.0.0.0';
  const clientPort = 48922 + (packetSeq % 1000);
  const hostHeader = destNode.hostname || destNode.name;
  const firstHopMac = isSameSubnet(srcIp, dstIp) ? destNode.primaryMac : gatewayMac(sourceNode, nodes);

  const fwd = computePathHops(sourceNode, destNode, nodes, links, 'TCP', port, clientPort, { dstIp });
  const rev = computePathHops(destNode, sourceNode, nodes, links, 'TCP', clientPort, port, { srcIp: dstIp });

  const fwdSteps = createPacketSteps(fwd.hops, links, nodes, 'TCP', fwd.dropAtNodeId, fwd.dropReason, sourceVlan, destVlan);
  const revSteps = createPacketSteps(rev.hops, links, nodes, 'TCP', rev.dropAtNodeId, rev.dropReason, destVlan, sourceVlan);
  const fwdLatency = sumLatency(fwdSteps);
  const revLatency = sumLatency(revSteps);
  const httpRtt = Number((fwdLatency + revLatency).toFixed(1));

  const toServer = (
    prefix: string,
    offset: number,
    protocol: ProtocolType,
    color: string,
    size: number,
    flags: string[],
    seqNum: number,
    message: string,
    summary: string,
    payload?: Record<string, any>
  ): SimulatedPacket => ({
    id: newPacketId(prefix),
    timestamp: Date.now() + offset,
    sourceNodeId: sourceNode.id,
    destNodeId: destNode.id,
    protocol,
    color,
    sizeBytes: size,
    totalLatencyMs: fwdLatency,
    layer2: { destMac: firstHopMac, sourceMac: sourceNode.primaryMac, etherType: '0x0800 (IPv4)', ...tagged(sourceVlan) },
    layer3: { sourceIP: srcIp, destIP: dstIp, ttl: 64, protocolNumber: 6, protocolName: protocol },
    layer4: { sourcePort: clientPort, destPort: port, flags, sequenceNumber: seqNum },
    layer7: { application: protocol, message, payload },
    summary,
    ...baseState,
    steps: fwdSteps,
  });

  const toClient = (
    prefix: string,
    offset: number,
    protocol: ProtocolType,
    color: string,
    size: number,
    flags: string[],
    seqNum: number,
    message: string,
    summary: string,
    payload?: Record<string, any>
  ): SimulatedPacket => ({
    id: newPacketId(prefix),
    timestamp: Date.now() + offset,
    sourceNodeId: destNode.id,
    destNodeId: sourceNode.id,
    protocol,
    color,
    sizeBytes: size,
    totalLatencyMs: httpRtt,
    layer2: { destMac: sourceNode.primaryMac, sourceMac: destNode.primaryMac, etherType: '0x0800 (IPv4)', ...tagged(destVlan) },
    layer3: { sourceIP: dstIp, destIP: srcIp, ttl: 64 - forwardingRouters(rev.hops, nodes).length, protocolNumber: 6, protocolName: protocol },
    layer4: { sourcePort: port, destPort: clientPort, flags, sequenceNumber: seqNum },
    layer7: { application: protocol, message, payload },
    summary,
    ...baseState,
    steps: revSteps,
  });

  // 1. TCP SYN
  const syn = toServer(
    'tcp-syn', 0, 'TCP', '#ec4899', 66, ['SYN'], 0,
    `${clientPort} -> ${port} [SYN] Seq=0 Win=64240 MSS=1460 (retardo: ${fwdLatency}ms)`,
    `TCP Handshake: [SYN] ${sourceNode.name} -> ${destNode.name}:${port} [VLAN ${sourceVlan}]`
  );

  if (fwd.dropAtNodeId) return { packets: [syn], outcome: 'timeout', dropReason: fwd.dropReason };

  // 2a. Closed port: the server answers with RST
  const open = OPEN_PORTS[destNode.id] || [];
  if (!open.includes(port)) {
    const rst = toClient(
      'tcp-rst', 600, 'TCP', '#f43f5e', 54, ['RST', 'ACK'], 0,
      `${port} -> ${clientPort} [RST, ACK] Seq=0 Ack=1 (puerto cerrado)`,
      `TCP RST: ${destNode.name}:${port} rechaza la conexión (no hay ningún servicio escuchando)`
    );
    return { packets: [syn, rst], outcome: rev.dropAtNodeId ? 'timeout' : 'refused', dropReason: rev.dropReason };
  }

  // 2b. SYN-ACK
  const synAck = toClient(
    'tcp-synack', 600, 'TCP', '#db2777', 66, ['SYN', 'ACK'], 0,
    `${port} -> ${clientPort} [SYN, ACK] Seq=0 Ack=1 Win=65160 MSS=1460`,
    `TCP Handshake: [SYN, ACK] ${destNode.name}:${port} -> ${sourceNode.name}`
  );
  if (rev.dropAtNodeId) return { packets: [syn, synAck], outcome: 'timeout', dropReason: rev.dropReason };

  // 3. ACK closes the 3-way handshake
  const ack = toServer(
    'tcp-ack', 1200, 'TCP', '#ec4899', 54, ['ACK'], 1,
    `${clientPort} -> ${port} [ACK] Seq=1 Ack=1 (conexión establecida)`,
    `TCP Handshake: [ACK] ${sourceNode.name} -> ${destNode.name}:${port} (ESTABLISHED)`
  );

  const page = WEB_PAGES[destNode.id];
  if (!page || port === 1521 || port === 53) {
    // The port is open but the service does not speak HTTP
    const fin = toClient(
      'tcp-fin', 1800, 'TCP', '#f43f5e', 54, ['FIN', 'ACK'], 1,
      `${port} -> ${clientPort} [FIN, ACK] (el servicio no habla HTTP y cierra la conexión)`,
      `TCP FIN: ${destNode.name}:${port} cierra la conexión sin respuesta HTTP`
    );
    return { packets: [syn, synAck, ack, fin], outcome: 'not-http' };
  }

  const pathStr = urlPath || '/';
  const get = toServer(
    'http-get', 1800, port === 443 ? 'HTTPS' : 'HTTP', '#f97316', 312, ['PSH', 'ACK'], 1,
    `GET ${pathStr} HTTP/1.1\r\nHost: ${hostHeader}`,
    `HTTP GET ${pathStr} (${hostHeader}) [VLAN ${sourceVlan}]`,
    { method: 'GET', path: pathStr, host: hostHeader, userAgent: 'curl/8.5.0', accept: '*/*' }
  );

  const resp = toClient(
    'http-resp', 2400, port === 443 ? 'HTTPS' : 'HTTP', '#059669', 742, ['PSH', 'ACK'], 1,
    `HTTP/1.1 200 OK (text/html) RTT=${httpRtt}ms`,
    `HTTP/1.1 200 OK: ${destNode.name} entrega el contenido web a ${sourceNode.name} (RTT: ${httpRtt}ms) [VLAN ${destVlan}]`,
    { status: 200, server: page.server, contentType: 'text/html; charset=UTF-8', body: page.html }
  );

  return { packets: [syn, synAck, ack, get, resp], outcome: 'ok', html: page.html };
}

export interface TracerouteHop {
  ttl: number;
  nodeId?: string;
  name: string;
  ip: string;
  rttMs: number | null; // null = no answer (* * *)
  note?: string;
}

// Generate Traceroute probes with incremental TTL and the hop list the terminal prints
export function createTracerouteSimulation(
  sourceNode: NetworkNode,
  destNode: NetworkNode,
  nodes: NetworkNode[],
  links: NetworkLink[],
  destIp?: string
): { packets: SimulatedPacket[]; hops: TracerouteHop[] } {
  const sourceVlan = getNodeVlan(sourceNode, nodes);
  const destVlan = getNodeVlan(destNode, nodes);
  const targetIp = destIp || destNode.primaryIp || '0.0.0.0';
  const path = computePathHops(sourceNode, destNode, nodes, links, 'ICMP', 0, 0, { dstIp: targetIp });
  const packets: SimulatedPacket[] = [];
  const hops: TracerouteHop[] = [];

  // Nodes that answer a probe: every forwarding router, then the destination
  const responders = path.hops
    .map((id, idx) => ({ id, idx }))
    .filter(({ id, idx }) => idx > 0 && (nodes.find((n) => n.id === id)?.type === 'router' || id === destNode.id));

  for (const { id, idx } of responders) {
    const ttl = hops.length + 1;
    const hopNode = nodes.find((n) => n.id === id)!;
    const isDropPoint = path.dropAtNodeId === id;
    const isDest = id === destNode.id && !path.dropAtNodeId;
    const subHops = path.hops.slice(0, idx + 1);
    const steps = createPacketSteps(subHops, links, nodes, 'ICMP', isDropPoint ? path.dropAtNodeId : undefined, isDropPoint ? path.dropReason : undefined, sourceVlan, destVlan);
    const oneWay = sumLatency(steps);
    const hopIp = isDest ? targetIp : interfaceIpTowards(hopNode, path.hops[idx - 1], links);

    packets.push({
      id: newPacketId('trace'),
      timestamp: Date.now() + ttl * 400,
      sourceNodeId: sourceNode.id,
      destNodeId: id,
      protocol: 'ICMP',
      color: '#3b82f6',
      sizeBytes: 60,
      totalLatencyMs: Number((oneWay * 2).toFixed(1)),
      layer2: { destMac: gatewayMac(sourceNode, nodes), sourceMac: sourceNode.primaryMac, etherType: '0x0800 (IPv4)', ...tagged(sourceVlan) },
      layer3: { sourceIP: sourceNode.primaryIp || '0.0.0.0', destIP: targetIp, ttl, protocolNumber: 1, protocolName: 'ICMP' },
      layer4: { icmpType: isDest ? 'Echo Reply' : 'TTL Expired', sequenceNumber: ttl },
      layer7: {
        application: 'ICMP',
        message: isDropPoint
          ? `Salto ${ttl}: sin respuesta (${path.dropReason})`
          : isDest
          ? `Salto ${ttl}: destino alcanzado (${destNode.name}) tiempo=${(oneWay * 2).toFixed(1)}ms`
          : `Salto ${ttl}: TTL expirado en ${hopNode.name} (${hopIp}) tiempo=${(oneWay * 2).toFixed(1)}ms`,
      },
      summary: `Traceroute TTL=${ttl} -> ${hopNode.name} (${hopIp})`,
      ...baseState,
      steps,
    });

    if (isDropPoint) {
      hops.push({ ttl, nodeId: id, name: hopNode.name, ip: hopIp, rttMs: null, note: path.dropReason });
      break;
    }
    hops.push({ ttl, nodeId: id, name: hopNode.hostname || hopNode.name, ip: hopIp, rttMs: Number((oneWay * 2).toFixed(2)) });
  }

  // Dropped before any responder (e.g. VLAN isolation or a cable cut at the access layer)
  if (path.dropAtNodeId && !hops.some((h) => h.rttMs === null)) {
    const steps = createPacketSteps(path.hops, links, nodes, 'ICMP', path.dropAtNodeId, path.dropReason, sourceVlan, destVlan);
    if (steps.length) {
      packets.push({
        id: newPacketId('trace'),
        timestamp: Date.now(),
        sourceNodeId: sourceNode.id,
        destNodeId: destNode.id,
        protocol: 'ICMP',
        color: '#3b82f6',
        sizeBytes: 60,
        totalLatencyMs: 0,
        layer2: { destMac: gatewayMac(sourceNode, nodes), sourceMac: sourceNode.primaryMac, etherType: '0x0800 (IPv4)', ...tagged(sourceVlan) },
        layer3: { sourceIP: sourceNode.primaryIp || '0.0.0.0', destIP: targetIp, ttl: hops.length + 1, protocolNumber: 1, protocolName: 'ICMP' },
        layer4: { icmpType: 'Echo Request', sequenceNumber: hops.length + 1 },
        layer7: { application: 'ICMP', message: `Sonda perdida: ${path.dropReason}` },
        summary: `Traceroute: sonda descartada antes de llegar al siguiente salto`,
        ...baseState,
        steps,
      });
    }
    hops.push({ ttl: hops.length + 1, name: '*', ip: '', rttMs: null, note: path.dropReason });
  }

  return { packets, hops };
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
