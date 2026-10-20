export type NodeType = 'pc' | 'switch' | 'router' | 'ap' | 'server' | 'mobile' | 'cloud';

export type NetworkZone = 
  | 'aula1' 
  | 'aula2' 
  | 'aula3' 
  | 'wifi-guest' 
  | 'core-academic' 
  | 'admin-zone1' 
  | 'admin-zone2' 
  | 'core-admin' 
  | 'wan';

export type ProtocolType = 'ARP' | 'ICMP' | 'DNS' | 'HTTP' | 'HTTPS' | 'TCP' | 'UDP' | 'SSH' | 'DHCP';

export type RouterInterconnectionMode = 'interconnected' | 'independent';

export interface SubnetThresholds {
  aulas: number;
  invitados: number;
  admin: number;
  errors: number;
  enabled: boolean;
}

export interface InterfaceConfig {
  name: string; // e.g. "eth0", "eth1", "port1", "portUplink"
  ip: string;
  subnetMask: string;
  mac: string;
  gateway?: string;
  connectedToNodeId?: string;
  connectedToInterface?: string;
  vlanId?: number; // IEEE 802.1Q Access VLAN ID
  portMode?: 'access' | 'trunk'; // 802.1Q Port mode
  allowedVlans?: number[]; // Trunk allowed VLAN IDs
}

export interface RoutingTableEntry {
  destination: string; // e.g. "192.168.10.0"
  mask: string; // e.g. "255.255.255.0"
  gateway: string; // "0.0.0.0" (direct) or "10.0.0.2"
  interfaceName: string; // "eth1"
  metric: number;
}

export interface ArpTableEntry {
  ip: string;
  mac: string;
  interfaceName: string;
  type: 'dynamic' | 'static';
  updatedAt: number;
}

export interface MacTableEntry {
  mac: string;
  port: string;
  vlan: number; // IEEE 802.1Q VLAN ID
  ageSeconds: number;
  type?: 'DYNAMIC' | 'STATIC';
}

export interface FirewallRule {
  id: string;
  description: string;
  sourceSubnet: string; // e.g. "172.16.50.0/24", "192.168.10.15/32" or "any"
  destSubnet: string; // e.g. "192.168.100.0/24" or "any"
  protocol: ProtocolType | 'ANY';
  action: 'ALLOW' | 'DROP';
  enabled: boolean;
  sourcePort?: string; // e.g. "any", "1024-65535"
  destPort?: string; // e.g. "any", "80", "53", "443", "1521"
  direction?: 'IN' | 'OUT'; // Inbound or Outbound ACL
  interfaceName?: string; // e.g. "eth0", "eth1", "eth4"
  sequence?: number; // Cisco sequence number (10, 20, 30...)
  aclNumber?: number; // e.g. 101 (Extended ACL)
}

export interface NetworkNode {
  id: string;
  name: string;
  label: string;
  type: NodeType;
  zone: NetworkZone;
  x: number;
  y: number;
  interfaces: InterfaceConfig[];
  primaryIp?: string;
  primaryMac: string;
  gateway?: string;
  dnsServer?: string;
  
  // Node internal tables
  arpTable?: ArpTableEntry[];
  macTable?: MacTableEntry[]; // for switches
  routingTable?: RoutingTableEntry[]; // for routers and PCs
  firewallRules?: FirewallRule[]; // for routers
  
  // Status and stats
  isOnline: boolean;
  hostname?: string;
  osDescription?: string;
  stats: {
    packetsSent: number;
    packetsReceived: number;
    packetsDropped: number;
  };
}

export interface NetworkLink {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromPort: string;
  toPort: string;
  type: 'ethernet' | 'wifi' | 'trunk';
  bandwidthMbps: number;
  status: 'active' | 'degraded' | 'down';
  latency: number; // Base nominal latency in milliseconds (e.g., 1ms Ethernet, 4ms Wi-Fi, 25ms WAN)
  currentLatency?: number; // Dynamic fluctuating latency taking into account subnet traffic load & queueing
  jitter?: number; // Dynamic jitter variance (+/- ms)
}

export interface Layer2Frame {
  destMac: string;
  sourceMac: string;
  etherType: string; // "0x0800 (IPv4)" or "0x0806 (ARP)"
  vlanId?: number; // IEEE 802.1Q VLAN ID (1-4094)
  priority?: number; // 3-bit Priority Code Point (PCP 0-7)
  tpid?: string; // "0x8100 (IEEE 802.1Q)"
  isTagged?: boolean;
}

export interface Layer3Packet {
  sourceIP: string;
  destIP: string;
  ttl: number;
  protocolNumber: number; // 1: ICMP, 6: TCP, 17: UDP
  protocolName: ProtocolType;
}

export interface Layer4Segment {
  sourcePort?: number;
  destPort?: number;
  flags?: string[]; // e.g. ["SYN"], ["SYN", "ACK"], ["ACK"]
  icmpType?: 'Echo Request' | 'Echo Reply' | 'Dest Unreachable' | 'TTL Expired';
  sequenceNumber?: number;
}

export interface Layer7Data {
  application: string; // "HTTP", "DNS", "ICMP", "ARP"
  message: string;
  payload?: Record<string, any>;
}

export interface PacketAnimationStep {
  fromNodeId: string;
  toNodeId: string;
  linkId: string;
  explanation: string;
  isDropped?: boolean;
  dropReason?: string;
  isBroadcast?: boolean;
  stepLatencyMs?: number; // Latency incurred on this specific hop fluctuating with subnet load
}

export interface SimulatedPacket {
  id: string;
  timestamp: number;
  sourceNodeId: string;
  destNodeId?: string;
  protocol: ProtocolType;
  color: string;
  sizeBytes: number;
  
  // Total round-trip or transit latency in ms
  totalLatencyMs?: number;

  // OSI layers for Wireshark inspection
  layer2: Layer2Frame;
  layer3: Layer3Packet;
  layer4: Layer4Segment;
  layer7: Layer7Data;
  
  // Educational logs & animation
  summary: string;
  status: 'traveling' | 'delivered' | 'dropped';
  currentStepIndex: number;
  steps: PacketAnimationStep[];
  progress: number; // 0 to 1 along current step
}

export interface LabMission {
  id: string;
  title: string;
  description: string;
  objectives: string[];
  suggestedCommand: string;
  sourceNodeId: string;
  targetIpOrHost: string;
  expectedProtocol: ProtocolType;
  conceptSummary: string;
  difficulty: 'Principiante' | 'Intermedio' | 'Avanzado';
}
