import { describe, expect, test } from 'bun:test';
import { INITIAL_LINKS, INITIAL_NODES } from '../src/data/topologyData';
import {
  computePathHops,
  createArpResolution,
  createDnsSimulation,
  createHttpSimulation,
  createPingSimulation,
  createTracerouteSimulation,
  evaluateRouterAcl,
  isIpInCidr,
  isSameSubnet,
  isValidCidrOrAny,
  isValidPortSpec,
} from '../src/services/networkEngine';
import { NetworkLink, NetworkNode } from '../src/types/network';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const topo = () => ({ nodes: clone(INITIAL_NODES) as NetworkNode[], links: clone(INITIAL_LINKS) as NetworkLink[] });
const node = (nodes: NetworkNode[], id: string) => nodes.find((n) => n.id === id)!;
const setLink = (links: NetworkLink[], id: string, status: NetworkLink['status']) => {
  links.find((l) => l.id === id)!.status = status;
};
const setPortVlan = (nodes: NetworkNode[], sw: string, port: string, vlan: number) => {
  node(nodes, sw).interfaces.find((i) => i.name === port)!.vlanId = vlan;
};

describe('utilidades IPv4', () => {
  test('pertenencia a CIDR', () => {
    expect(isIpInCidr('192.168.100.20', '192.168.0.0/16')).toBe(true);
    expect(isIpInCidr('172.16.50.15', '192.168.0.0/16')).toBe(false);
    expect(isIpInCidr('10.0.0.2', '10.0.0.0/30')).toBe(true);
    expect(isIpInCidr('10.0.0.4', '10.0.0.0/30')).toBe(false);
    expect(isIpInCidr('no-es-ip', '10.0.0.0/8')).toBe(false);
  });

  test('misma subred respeta la máscara', () => {
    expect(isSameSubnet('10.0.0.1', '10.0.0.2', '255.255.255.252')).toBe(true);
    expect(isSameSubnet('10.0.0.1', '10.0.0.5', '255.255.255.252')).toBe(false);
  });

  test('validación de campos de ACL', () => {
    expect(isValidCidrOrAny('any')).toBe(true);
    expect(isValidCidrOrAny('192.168.1.0/24')).toBe(true);
    expect(isValidCidrOrAny('192.168.1/24')).toBe(false);
    expect(isValidCidrOrAny('10.0.0.0/33')).toBe(false);
    expect(isValidPortSpec('80,443')).toBe(true);
    expect(isValidPortSpec('1024-65535')).toBe(true);
    expect(isValidPortSpec('70000')).toBe(false);
    expect(isValidPortSpec('90-80')).toBe(false);
  });
});

describe('rutas', () => {
  test('ping al gateway no repite el router', () => {
    const { nodes, links } = topo();
    const r = computePathHops(node(nodes, 'pc-101'), node(nodes, 'r-academico'), nodes, links);
    expect(r.hops).toEqual(['pc-101', 'sw-aula1', 'r-academico']);
  });

  test('ping a Internet desde administración no duplica la nube', () => {
    const { nodes, links } = topo();
    const r = computePathHops(node(nodes, 'pc-direccion'), node(nodes, 'cloud-internet'), nodes, links);
    expect(r.hops).toEqual(['pc-direccion', 'sw-admin1', 'r-admin', 'cloud-internet']);
  });

  test('entre aulas pasa por el router académico', () => {
    const { nodes, links } = topo();
    const r = computePathHops(node(nodes, 'pc-101'), node(nodes, 'pc-201'), nodes, links);
    expect(r.hops).toEqual(['pc-101', 'sw-aula1', 'r-academico', 'sw-aula2', 'pc-201']);
    expect(r.dropAtNodeId).toBeUndefined();
  });

  test('cable de acceso cortado descarta el paquete', () => {
    const { nodes, links } = topo();
    setLink(links, 'link-pc201-sw2', 'down');
    const r = computePathHops(node(nodes, 'pc-101'), node(nodes, 'pc-201'), nodes, links);
    expect(r.dropKind).toBe('link');
    expect(r.dropAtNodeId).toBe('pc-201');
  });

  test('troncal caído: el router se queda sin ruta', () => {
    const { nodes, links } = topo();
    setLink(links, 'link-trunk-routers', 'down');
    const r = computePathHops(node(nodes, 'pc-101'), node(nodes, 'srv-campus'), nodes, links);
    expect(r.dropKind).toBe('route');
    expect(r.dropAtNodeId).toBe('r-academico');
  });
});

describe('VLAN 802.1Q', () => {
  test('puerto movido a la VLAN 99 queda aislado en L2', () => {
    const { nodes, links } = topo();
    setPortVlan(nodes, 'sw-aula1', 'port3', 99);
    const r = computePathHops(node(nodes, 'pc-101'), node(nodes, 'pc-103'), nodes, links);
    expect(r.dropKind).toBe('vlan');
    expect(r.dropAtNodeId).toBe('sw-aula1');
  });

  test('puerto en otra VLAN tampoco llega a otras redes', () => {
    const { nodes, links } = topo();
    setPortVlan(nodes, 'sw-aula1', 'port3', 99);
    const r = computePathHops(node(nodes, 'pc-103'), node(nodes, 'pc-201'), nodes, links);
    expect(r.dropKind).toBe('vlan');
  });

  test('dos puertos en la misma VLAN nueva sí se ven', () => {
    const { nodes, links } = topo();
    setPortVlan(nodes, 'sw-aula1', 'port2', 99);
    setPortVlan(nodes, 'sw-aula1', 'port3', 99);
    const r = computePathHops(node(nodes, 'pc-102'), node(nodes, 'pc-103'), nodes, links);
    expect(r.dropAtNodeId).toBeUndefined();
  });
});

describe('ACL', () => {
  test('invitados no llegan a dirección (misión 3)', () => {
    const { nodes, links } = topo();
    const ping = createPingSimulation(node(nodes, 'laptop-guest'), '192.168.100.10', nodes, links);
    expect(ping.outcome).toBe('filtered');
    expect(ping.logMessage).toContain('Administratively Prohibited');
    expect(ping.requestPacket.status).toBe('traveling');
    expect(ping.requestPacket.steps.at(-1)?.isDropped).toBe(true);
    expect(ping.requestPacket.steps.at(-1)?.toNodeId).toBe('r-academico');
  });

  test('la BD de secretaría (1521) se bloquea desde aulas en R-Admin', () => {
    const { nodes, links } = topo();
    const r = computePathHops(node(nodes, 'pc-101'), node(nodes, 'srv-gestion'), nodes, links, 'TCP', 1521, 40000);
    expect(r.dropKind).toBe('acl');
    expect(r.dropAtNodeId).toBe('r-admin');
  });

  test('las reglas solo aplican en su interfaz', () => {
    const { nodes } = topo();
    const r = node(nodes, 'r-academico');
    // acl-acad-10 está en eth4 IN (Wi-Fi). Entrando por eth1 no debe aplicarse.
    const wifi = evaluateRouterAcl(r, '172.16.50.15', '192.168.10.11', 'ICMP', 0, 0, { ingress: 'eth4', egress: 'eth1' });
    const aula = evaluateRouterAcl(r, '172.16.50.15', '192.168.10.11', 'ICMP', 0, 0, { ingress: 'eth1', egress: 'eth1' });
    expect(wifi.isAllowed).toBe(false);
    expect(aula.isAllowed).toBe(true);
  });

  test('una ACL que filtra la respuesta hace fallar el ping', () => {
    const { nodes, links } = topo();
    node(nodes, 'r-academico').firewallRules!.unshift({
      id: 'test-out',
      sequence: 1,
      description: 'Bloquear respuestas hacia Aula 1',
      sourceSubnet: '192.168.20.0/24',
      destSubnet: '192.168.10.0/24',
      protocol: 'ICMP',
      action: 'DROP',
      enabled: true,
      interfaceName: 'eth2',
      direction: 'IN',
    });
    const ping = createPingSimulation(node(nodes, 'pc-101'), '192.168.20.11', nodes, links);
    expect(ping.outcome).toBe('timeout');
    expect(ping.replyPacket?.steps.at(-1)?.isDropped).toBe(true);
  });
});

describe('ICMP', () => {
  test('el TTL de la respuesta baja un salto por router', () => {
    const { nodes, links } = topo();
    const local = createPingSimulation(node(nodes, 'pc-101'), '192.168.10.12', nodes, links);
    const routed = createPingSimulation(node(nodes, 'pc-101'), '192.168.20.11', nodes, links);
    const twoRouters = createPingSimulation(node(nodes, 'pc-101'), '192.168.200.50', nodes, links);
    expect(local.logMessage).toContain('ttl=64');
    expect(routed.logMessage).toContain('ttl=63');
    expect(twoRouters.logMessage).toContain('ttl=62');
  });

  test('TTL=1 caduca en el primer router con Time Exceeded', () => {
    const { nodes, links } = topo();
    const ping = createPingSimulation(node(nodes, 'pc-101'), '192.168.200.50', nodes, links, 1, 1);
    expect(ping.outcome).toBe('ttl-exceeded');
    expect(ping.logMessage).toBe('From 192.168.10.1 icmp_seq=1 Time to live exceeded');
    expect(ping.replyPacket?.layer4.icmpType).toBe('TTL Expired');
  });

  test('TTL=2 caduca en R-Admin (interfaz del troncal)', () => {
    const { nodes, links } = topo();
    const ping = createPingSimulation(node(nodes, 'pc-101'), '192.168.200.50', nodes, links, 1, 2);
    expect(ping.logMessage).toBe('From 10.0.0.2 icmp_seq=1 Time to live exceeded');
  });

  test('un ping a Internet en reposo no se marca como congestión', () => {
    const { nodes, links } = topo();
    const ping = createPingSimulation(node(nodes, 'pc-101'), '8.8.8.8', nodes, links);
    expect(ping.outcome).toBe('reply');
    expect(ping.logMessage).not.toContain('congestión');
  });

  test('IP inexistente en la misma subred: Destination Host Unreachable', () => {
    const { nodes, links } = topo();
    const ping = createPingSimulation(node(nodes, 'pc-101'), '192.168.10.99', nodes, links);
    expect(ping.outcome).toBe('unreachable');
    expect(ping.replyPacket).toBeUndefined();
  });
});

describe('traceroute', () => {
  test('muestra las IP de entrada de cada router (misión 5)', () => {
    const { nodes, links } = topo();
    const t = createTracerouteSimulation(node(nodes, 'pc-101'), node(nodes, 'srv-gestion'), nodes, links);
    expect(t.hops.map((h) => h.ip)).toEqual(['192.168.10.1', '10.0.0.2', '192.168.100.20']);
    expect(t.hops.every((h) => h.rttMs !== null)).toBe(true);
  });

  test('se corta con * al llegar al filtro', () => {
    const { nodes, links } = topo();
    const t = createTracerouteSimulation(node(nodes, 'laptop-guest'), node(nodes, 'pc-direccion'), nodes, links);
    expect(t.hops.length).toBe(1);
    expect(t.hops[0].rttMs).toBeNull();
  });
});

describe('ARP, DNS y HTTP', () => {
  test('ARP en la misma VLAN tiene respuesta y recorre el switch', () => {
    const { nodes, links } = topo();
    const arp = createArpResolution(node(nodes, 'pc-101'), '192.168.10.12', nodes, links);
    expect(arp.arpReply).toBeDefined();
    expect(arp.arpReply!.steps.map((s) => s.toNodeId)).toEqual(['sw-aula1', 'pc-101']);
  });

  test('ARP hacia un puerto aislado no tiene respuesta', () => {
    const { nodes, links } = topo();
    setPortVlan(nodes, 'sw-aula1', 'port2', 99);
    const arp = createArpResolution(node(nodes, 'pc-101'), '192.168.10.12', nodes, links);
    expect(arp.arpReply).toBeUndefined();
  });

  test('DNS interno resuelve el campus', () => {
    const { nodes, links } = topo();
    const dns = createDnsSimulation(node(nodes, 'pc-301'), 'campus.academia.edu', nodes, links);
    expect(dns.outcome).toBe('ok');
    expect(dns.resolvedIp).toBe('192.168.200.50');
  });

  test('un nombre inexistente da NXDOMAIN', () => {
    const { nodes, links } = topo();
    const dns = createDnsSimulation(node(nodes, 'pc-301'), 'noexiste.academia.edu', nodes, links);
    expect(dns.outcome).toBe('nxdomain');
    expect(dns.resolvedIp).toBeUndefined();
  });

  test('invitados preguntan a 8.8.8.8, que no conoce nombres internos', () => {
    const { nodes, links } = topo();
    const dns = createDnsSimulation(node(nodes, 'laptop-guest'), 'campus.academia.edu', nodes, links);
    expect(dns.serverIp).toBe('8.8.8.8');
    expect(dns.outcome).toBe('nxdomain');
  });

  test('curl al campus completa el handshake y recibe 200', () => {
    const { nodes, links } = topo();
    const http = createHttpSimulation(node(nodes, 'pc-301'), node(nodes, 'srv-campus'), '/', nodes, links);
    expect(http.outcome).toBe('ok');
    expect(http.packets.map((p) => p.layer4.flags?.join(','))).toEqual(['SYN', 'SYN,ACK', 'ACK', 'PSH,ACK', 'PSH,ACK']);
  });

  test('curl a un PC sin servidor web recibe RST', () => {
    const { nodes, links } = topo();
    const http = createHttpSimulation(node(nodes, 'pc-101'), node(nodes, 'pc-102'), '/', nodes, links);
    expect(http.outcome).toBe('refused');
  });

  test('curl al puerto 1521 desde un aula se queda sin respuesta (ACL)', () => {
    const { nodes, links } = topo();
    const http = createHttpSimulation(node(nodes, 'pc-101'), node(nodes, 'srv-gestion'), '/', nodes, links, 1521);
    expect(http.outcome).toBe('timeout');
  });
});
