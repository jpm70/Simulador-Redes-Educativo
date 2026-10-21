import React, { useState } from 'react';
import { X, Network, Calculator, Sliders, Check, Copy, ExternalLink, Shield, Server, Laptop, Wifi } from 'lucide-react';
import { NetworkNode } from '../types/network';
import { isValidIpv4 } from '../services/networkEngine';

interface SubnetInfo {
  vlanId: number;
  name: string;
  network: string;
  cidr: number;
  mask: string;
  gateway: string;
  broadcast: string;
  usableRange: string;
  hostsCount: number;
  description: string;
  devices: string[];
}

interface SubnetCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: NetworkNode[];
}

export const SubnetCalculatorModal: React.FC<SubnetCalculatorModalProps> = ({
  isOpen,
  onClose,
  nodes,
}) => {
  const [activeTab, setActiveTab] = useState<'campus' | 'calculator'>('campus');
  
  // Custom calculator state
  const [calcIp, setCalcIpRaw] = useState<string>('192.168.10.0');
  const [lastValidIp, setLastValidIp] = useState<string>('192.168.10.0');
  const setCalcIp = (value: string) => {
    setCalcIpRaw(value);
    if (isValidIpv4(value.trim())) setLastValidIp(value.trim());
  };
  const [calcCidr, setCalcCidr] = useState<number>(24);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  // Real campus subnets
  const campusSubnets: SubnetInfo[] = [
    {
      vlanId: 10,
      name: 'VLAN 10 · Aulas Informática 1',
      network: '192.168.10.0',
      cidr: 24,
      mask: '255.255.255.0',
      gateway: '192.168.10.1 (Router Académico)',
      broadcast: '192.168.10.255',
      usableRange: '192.168.10.1 - 192.168.10.254',
      hostsCount: 254,
      description: 'Subred cableada para equipos de prácticas de estudiantes del Aula 1.',
      devices: nodes.filter((n) => n.zone === 'aula1').map((n) => `${n.name} (${n.primaryIp})`),
    },
    {
      vlanId: 20,
      name: 'VLAN 20 · Aulas Informática 2',
      network: '192.168.20.0',
      cidr: 24,
      mask: '255.255.255.0',
      gateway: '192.168.20.1 (Router Académico)',
      broadcast: '192.168.20.255',
      usableRange: '192.168.20.1 - 192.168.20.254',
      hostsCount: 254,
      description: 'Subred cableada para equipos de prácticas de estudiantes del Aula 2.',
      devices: nodes.filter((n) => n.zone === 'aula2').map((n) => `${n.name} (${n.primaryIp})`),
    },
    {
      vlanId: 30,
      name: 'VLAN 30 · Aula 3 Robótica & Dev',
      network: '192.168.30.0',
      cidr: 24,
      mask: '255.255.255.0',
      gateway: '192.168.30.1 (Router Académico)',
      broadcast: '192.168.30.255',
      usableRange: '192.168.30.1 - 192.168.30.254',
      hostsCount: 254,
      description: 'Subred cableada para equipos de prácticas de estudiantes del Aula 3.',
      devices: nodes.filter((n) => n.zone === 'aula3').map((n) => `${n.name} (${n.primaryIp})`),
    },
    {
      vlanId: 50,
      name: 'VLAN 50 · Wi-Fi Invitados (Segmentada)',
      network: '172.16.50.0',
      cidr: 24,
      mask: '255.255.255.0',
      gateway: '172.16.50.1 (Router Académico)',
      broadcast: '172.16.50.255',
      usableRange: '172.16.50.1 - 172.16.50.254',
      hostsCount: 254,
      description: 'Zona inalámbrica aislada por Firewall para smartphones y portátiles externos.',
      devices: nodes.filter((n) => n.zone === 'wifi-guest').map((n) => `${n.name} (${n.primaryIp})`),
    },
    {
      vlanId: 100,
      name: 'VLAN 100 · Dirección & Secretaría',
      network: '192.168.100.0',
      cidr: 24,
      mask: '255.255.255.0',
      gateway: '192.168.100.1 (Router Administración)',
      broadcast: '192.168.100.255',
      usableRange: '192.168.100.1 - 192.168.100.254',
      hostsCount: 254,
      description: 'Zona de alta seguridad con el servidor ERP y la base de datos de secretaría (puerto 1521 protegido por ACL).',
      devices: nodes.filter((n) => n.zone === 'admin-zone1').map((n) => `${n.name} (${n.primaryIp})`),
    },
    {
      vlanId: 200,
      name: 'VLAN 200 · Profesores & Servidores',
      network: '192.168.200.0',
      cidr: 24,
      mask: '255.255.255.0',
      gateway: '192.168.200.1 (Router Administración)',
      broadcast: '192.168.200.255',
      usableRange: '192.168.200.1 - 192.168.200.254',
      hostsCount: 254,
      description: 'Subred docente con SRV-Campus (servidor web y DNS interno del campus).',
      devices: nodes.filter((n) => n.zone === 'admin-zone2').map((n) => `${n.name} (${n.primaryIp})`),
    },
    {
      vlanId: 1,
      name: 'Troncal L3 Punto a Punto (Inter-Router)',
      network: '10.0.0.0',
      cidr: 30,
      mask: '255.255.255.252',
      gateway: 'Rutas estáticas entre routers',
      broadcast: '10.0.0.3',
      usableRange: '10.0.0.1 - 10.0.0.2',
      hostsCount: 2,
      description: 'Enlace troncal /30 de alta velocidad entre el Router Académico y el Router de Administración.',
      devices: ['R-Academico (10.0.0.1)', 'R-Admin (10.0.0.2)'],
    },
  ];

  // Helper math for IPv4 Subnetting
  const ipToInt = (ip: string) => {
    return ip
      .split('.')
      .reduce((acc, octet) => (acc << 8) + parseInt(octet || '0', 10), 0) >>> 0;
  };

  const intToIp = (int: number) => {
    return [
      (int >>> 24) & 255,
      (int >>> 16) & 255,
      (int >>> 8) & 255,
      int & 255,
    ].join('.');
  };

  const cidrToMaskInt = (cidr: number) => {
    if (cidr === 0) return 0;
    return (0xffffffff << (32 - cidr)) >>> 0;
  };

  const calculateSubnet = (ipStr: string, cidr: number) => {
    const rawInt = ipToInt(ipStr);
    const maskInt = cidrToMaskInt(cidr);
    const wildcardInt = ~maskInt >>> 0;

    const networkInt = (rawInt & maskInt) >>> 0;
    const broadcastInt = (networkInt | wildcardInt) >>> 0;

    const totalHosts = Math.pow(2, 32 - cidr);
    const usableHosts = cidr >= 31 ? (cidr === 31 ? 2 : 1) : Math.max(0, totalHosts - 2);

    const firstUsableInt = cidr >= 31 ? networkInt : networkInt + 1;
    const lastUsableInt = cidr >= 31 ? broadcastInt : broadcastInt - 1;

    // Class & Private determination
    const firstOctet = (rawInt >>> 24) & 255;
    let ipClass = 'C';
    if (firstOctet === 0) ipClass = 'Reservada (0.0.0.0/8)';
    else if (firstOctet === 127) ipClass = 'A (Loopback 127.0.0.0/8)';
    else if (firstOctet >= 1 && firstOctet <= 126) ipClass = 'A';
    else if (firstOctet >= 128 && firstOctet <= 191) ipClass = 'B';
    else if (firstOctet >= 192 && firstOctet <= 223) ipClass = 'C';
    else if (firstOctet >= 224 && firstOctet <= 239) ipClass = 'D (Multicast)';
    else if (firstOctet >= 240) ipClass = 'E (Experimental)';

    let isPrivate = false;
    if (firstOctet === 10) isPrivate = true; // 10.0.0.0/8
    if (firstOctet === 172 && ((rawInt >>> 16) & 255) >= 16 && ((rawInt >>> 16) & 255) <= 31) isPrivate = true; // 172.16.0.0/12
    if (firstOctet === 192 && ((rawInt >>> 16) & 255) === 168) isPrivate = true; // 192.168.0.0/16

    // Binary representation
    const maskBinary = maskInt.toString(2).padStart(32, '0');
    const netBinary = networkInt.toString(2).padStart(32, '0');

    return {
      networkIp: intToIp(networkInt),
      broadcastIp: intToIp(broadcastInt),
      netmask: intToIp(maskInt),
      wildcard: intToIp(wildcardInt),
      firstUsable: intToIp(firstUsableInt),
      lastUsable: intToIp(lastUsableInt),
      totalHosts,
      usableHosts,
      ipClass,
      isPrivate,
      maskBinary,
      netBinary,
    };
  };

  const ipIsValid = isValidIpv4(calcIp.trim());
  const calcResult = calculateSubnet(lastValidIp, calcCidr);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-950 border border-sky-800/60 rounded-lg text-sky-400">
              <Network size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Herramienta Didáctica de Subredes & VLSM</span>
                <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
                  IPv4 / IEEE 802.1Q
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Aprende la arquitectura de direccionamiento IP, máscaras de subred, rangos útiles y dominios de difusión.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center px-6 pt-3 border-b border-slate-800 bg-slate-950/50 gap-4">
          <button
            onClick={() => setActiveTab('campus')}
            className={`flex items-center gap-2 pb-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'campus'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Network size={14} />
            <span>Mapa de Subredes del Campus</span>
          </button>
          <button
            onClick={() => setActiveTab('calculator')}
            className={`flex items-center gap-2 pb-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'calculator'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calculator size={14} />
            <span>Calculadora VLSM / CIDR Interactiva</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {activeTab === 'campus' ? (
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-300 leading-relaxed">
                <span className="text-sky-400 font-bold">Dominios de Difusión y Segmentación: </span>
                Cada subred lógica pertenece a una VLAN específica en los switches. Los equipos dentro de la misma subred se comunican a nivel de Enlace (L2 mediante conmutación Ethernet y tablas CAM/MAC). Para saltar entre subredes diferentes se requiere un Router L3 con su correspondiente Puerta de Enlace predeterminada (Default Gateway).
              </div>

              <div className="space-y-3">
                {campusSubnets.map((sub) => (
                  <div
                    key={sub.name}
                    className="p-4 bg-slate-950 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-200">{sub.name}</span>
                        <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                          {sub.network}/{sub.cidr}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">
                        {sub.hostsCount} hosts útiles
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mb-3">{sub.description}</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs bg-slate-900/80 p-3 rounded-lg border border-slate-800 font-mono">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Máscara de Subred:</span>
                        <span className="text-slate-300 font-semibold">{sub.mask}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Rango Útil Asignable:</span>
                        <span className="text-emerald-400 font-semibold">{sub.usableRange}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Dirección Broadcast:</span>
                        <span className="text-amber-300 font-semibold">{sub.broadcast}</span>
                      </div>
                      <div className="md:col-span-3 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-slate-500">Gateway (Router): </span>
                          <span className="text-indigo-300">{sub.gateway}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          <span className="text-slate-500">Equipos: </span>
                          <span>{sub.devices.join(', ')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Calculator inputs */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Dirección IP Base o de Host:
                    </label>
                    <input
                      type="text"
                      value={calcIp}
                      onChange={(e) => setCalcIp(e.target.value)}
                      placeholder="192.168.10.0"
                      className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-sm font-mono text-sky-400 focus:outline-none ${ipIsValid ? 'border-slate-700 focus:border-sky-500' : 'border-rose-600 focus:border-rose-500'}`}
                    />
                    {!ipIsValid && (
                      <p className="text-[11px] text-rose-400">
                        IPv4 no válida (4 octetos de 0 a 255). Se muestran los cálculos de {lastValidIp}.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex justify-between">
                      <span>Prefijo CIDR:</span>
                      <span className="font-mono text-sky-400 font-bold">/{calcCidr}</span>
                    </label>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="range"
                        min={8}
                        max={30}
                        value={calcCidr}
                        onChange={(e) => setCalcCidr(parseInt(e.target.value, 10))}
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80 text-xs">
                  <span className="text-slate-500">Plantillas típicas:</span>
                  <button
                    onClick={() => {
                      setCalcIp('10.0.0.0');
                      setCalcCidr(30);
                    }}
                    className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px]"
                  >
                    /30 (2 hosts · Enlace Routers)
                  </button>
                  <button
                    onClick={() => {
                      setCalcIp('192.168.1.0');
                      setCalcCidr(26);
                    }}
                    className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px]"
                  >
                    /26 (62 hosts · Departamento)
                  </button>
                  <button
                    onClick={() => {
                      setCalcIp('192.168.10.0');
                      setCalcCidr(24);
                    }}
                    className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px]"
                  >
                    /24 (254 hosts · Clase C Estándar)
                  </button>
                  <button
                    onClick={() => {
                      setCalcIp('172.16.0.0');
                      setCalcCidr(20);
                    }}
                    className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px]"
                  >
                    /20 (4094 hosts · Campus Grande)
                  </button>
                </div>
              </div>

              {/* Calculated Results Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-[11px] text-slate-500 block">Dirección de Red:</span>
                  <span className="text-sm font-mono font-bold text-sky-400">{calcResult.networkIp}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-[11px] text-slate-500 block">Máscara de Subred:</span>
                  <span className="text-sm font-mono font-bold text-slate-200">{calcResult.netmask}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-[11px] text-slate-500 block">Máscara Wildcard (Cisco/OSPF):</span>
                  <span className="text-sm font-mono font-bold text-indigo-400">{calcResult.wildcard}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-[11px] text-slate-500 block">Dirección Broadcast:</span>
                  <span className="text-sm font-mono font-bold text-amber-400">{calcResult.broadcastIp}</span>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg md:col-span-2">
                  <span className="text-[11px] text-slate-500 block">Rango de Hosts Útiles (Usable IPs):</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    {calcResult.firstUsable} — {calcResult.lastUsable}
                  </span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-[11px] text-slate-500 block">Hosts Útiles Asignables:</span>
                  <span className="text-sm font-mono font-bold text-slate-100">
                    {calcResult.usableHosts.toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-[11px] text-slate-500 block">Clase & Ámbito RFC 1918:</span>
                  <span className="text-xs font-mono font-bold text-slate-200">
                    Clase {calcResult.ipClass} · {calcResult.isPrivate ? 'Privada (LAN)' : 'Pública (WAN)'}
                  </span>
                </div>
              </div>

              {/* Binary Bitwise Educational Representation */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-300 font-semibold font-sans">
                  <span>Desglose Binario Educativo (32 Bits IPv4):</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
                      <span>Bits de Red ({calcCidr})</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                      <span>Bits de Host ({32 - calcCidr})</span>
                    </span>
                  </div>
                </div>

                <div className="space-y-2 bg-slate-900 p-3 rounded-lg border border-slate-800/80">
                  <div>
                    <span className="text-slate-500 text-[11px] block mb-1">Máscara Binaria:</span>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {[0, 8, 16, 24].map((offset, octIdx) => (
                        <div key={octIdx} className="bg-slate-950 px-2 py-1 rounded border border-slate-800">
                          {Array.from({ length: 8 }).map((_, bitIdx) => {
                            const globalBit = offset + bitIdx;
                            const isNet = globalBit < calcCidr;
                            return (
                              <span
                                key={bitIdx}
                                className={isNet ? 'text-sky-400 font-bold' : 'text-amber-400/80 font-bold'}
                              >
                                {calcResult.maskBinary[globalBit]}
                              </span>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500 text-[11px] block mb-1">Dirección de Red Binaria:</span>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {[0, 8, 16, 24].map((offset, octIdx) => (
                        <div key={octIdx} className="bg-slate-950 px-2 py-1 rounded border border-slate-800">
                          {Array.from({ length: 8 }).map((_, bitIdx) => {
                            const globalBit = offset + bitIdx;
                            const isNet = globalBit < calcCidr;
                            return (
                              <span
                                key={bitIdx}
                                className={isNet ? 'text-emerald-400 font-bold' : 'text-slate-600'}
                              >
                                {calcResult.netBinary[globalBit]}
                              </span>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
