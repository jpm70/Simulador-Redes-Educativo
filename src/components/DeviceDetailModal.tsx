import React, { useState } from 'react';
import { NetworkNode, NetworkLink, FirewallRule } from '../types/network';
import { X, Network, HardDrive, Router, Shield, Activity, RefreshCw, Zap } from 'lucide-react';

interface DeviceModalProps {
  node: NetworkNode | null;
  links?: NetworkLink[];
  onClose: () => void;
  onToggleFirewallRule?: (nodeId: string, ruleId: string) => void;
  onFlushArp?: (nodeId: string) => void;
  onPortVlanChange?: (switchId: string, portName: string, newVlanId: number) => void;
  onOpenAclEditor?: (routerId: string) => void;
}

export const DeviceDetailModal: React.FC<DeviceModalProps> = ({
  node,
  links = [],
  onClose,
  onToggleFirewallRule,
  onFlushArp,
  onPortVlanChange,
  onOpenAclEditor,
}) => {
  const [activeTab, setActiveTab] = useState<'interfaces' | 'tables' | 'firewall' | 'stats'>('interfaces');

  if (!node) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden font-mono">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-950 border border-sky-800/60 rounded-lg text-sky-400">
              {node.type === 'router' ? (
                <Router size={20} />
              ) : node.type === 'switch' ? (
                <HardDrive size={20} />
              ) : (
                <Network size={20} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100 font-sans">{node.name}</h3>
                <span className="text-slate-500 font-mono text-xs">({node.hostname || node.id})</span>
              </div>
              <p className="text-xs text-slate-400 font-sans">{node.label} · {node.osDescription || 'Sistema de Red'}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-800 bg-slate-950/50">
          <button
            onClick={() => setActiveTab('interfaces')}
            className={`px-3 py-2 text-xs font-semibold rounded-t border-b-2 transition-colors ${
              activeTab === 'interfaces'
                ? 'border-sky-500 text-sky-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Interfaces & IP
          </button>
          <button
            onClick={() => setActiveTab('tables')}
            className={`px-3 py-2 text-xs font-semibold rounded-t border-b-2 transition-colors ${
              activeTab === 'tables'
                ? 'border-sky-500 text-sky-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {node.type === 'switch' ? 'Tabla MAC (CAM)' : node.type === 'router' ? 'Tabla de Rutas' : 'Caché ARP'}
          </button>
          {node.type === 'router' && (
            <button
              onClick={() => setActiveTab('firewall')}
              className={`px-3 py-2 text-xs font-semibold rounded-t border-b-2 transition-colors ${
                activeTab === 'firewall'
                  ? 'border-sky-500 text-sky-400 bg-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Reglas Firewall (ACL)
            </button>
          )}
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-3 py-2 text-xs font-semibold rounded-t border-b-2 transition-colors ${
              activeTab === 'stats'
                ? 'border-sky-500 text-sky-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Métricas de Tráfico
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 text-xs">
          {/* TAB 1: Interfaces */}
          {activeTab === 'interfaces' && (
            <div className="space-y-4">
              <div className="text-slate-400 font-sans text-xs">
                Configuración física y lógica de las tarjetas de red (NIC):
              </div>
              <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
                {node.interfaces.map((iface) => {
                  const connectedLink = links.find(
                    (l) =>
                      (l.fromNodeId === node.id && l.fromPort === iface.name) ||
                      (l.toNodeId === node.id && l.toPort === iface.name) ||
                      (l.fromNodeId === node.id && l.toNodeId === iface.connectedToNodeId) ||
                      (l.toNodeId === node.id && l.fromNodeId === iface.connectedToNodeId)
                  );

                  return (
                    <div key={iface.name} className="p-3 grid grid-cols-2 gap-2 text-slate-300">
                      <div>
                        <span className="text-slate-500">Interfaz:</span>{' '}
                        <span className="text-sky-400 font-bold">{iface.name}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Dirección MAC:</span>{' '}
                        <span className="text-slate-200">{iface.mac}</span>
                      </div>
                      {iface.ip && (
                        <div>
                          <span className="text-slate-500">Dirección IP:</span>{' '}
                          <span className="text-emerald-400 font-semibold">{iface.ip}</span>
                        </div>
                      )}
                      {iface.subnetMask && (
                        <div>
                          <span className="text-slate-500">Máscara:</span>{' '}
                          <span className="text-slate-300">{iface.subnetMask}</span>
                        </div>
                      )}
                      {iface.gateway && (
                        <div>
                          <span className="text-slate-500">Gateway:</span>{' '}
                          <span className="text-slate-300">{iface.gateway}</span>
                        </div>
                      )}
                      {connectedLink && (
                        <div className="col-span-2 mt-1 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 flex items-center gap-1">
                            <Zap size={11} className="text-amber-400" /> Latencia de Enlace:
                          </span>
                          <span className="font-mono text-amber-300 font-semibold">
                            Base: {connectedLink.latency} ms | Dinámica: {connectedLink.currentLatency || connectedLink.latency} ms (Jitter: ±{connectedLink.jitter || 0.2} ms)
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Tables (MAC / Routing / ARP) */}
          {activeTab === 'tables' && (
            <div className="space-y-4">
              {/* Switch MAC Table & IEEE 802.1Q VLAN Segmentation */}
              {node.type === 'switch' && (
                <div className="space-y-4">
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-slate-400 font-sans text-xs leading-relaxed">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-slate-200 font-bold">Switch L2 con IEEE 802.1Q (VLAN Tagging & Segmentación):</span>
                      <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800 text-[10px] font-mono">
                        802.1Q Activo
                      </span>
                    </div>
                    Aprende dinámicamente direcciones MAC asociadas a cada puerto y VLAN ID. Los equipos en diferentes VLANs dentro del mismo hardware físico quedan aislados en Capa 2 y requieren enrutamiento para comunicarse.
                  </div>

                  {/* Interactive VLAN Port Configuration */}
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-200 font-semibold font-sans">
                        Configuración de Puertos y Segmentación Lógica (VLANs):
                      </span>
                      <span className="text-slate-500 text-[11px] font-sans">Mismo hardware físico</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {node.interfaces.map((iface) => (
                        <div
                          key={iface.name}
                          className="p-2.5 bg-slate-900 border border-slate-800/80 rounded-lg flex flex-col justify-between gap-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sky-400">{iface.name}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                iface.portMode === 'trunk'
                                  ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              }`}
                            >
                              {iface.portMode === 'trunk' ? 'TRONCAL 802.1Q' : 'ACCESO'}
                            </span>
                          </div>

                          {iface.portMode === 'trunk' ? (
                            <div className="text-[11px] text-slate-400 mt-1">
                              Trunk Uplink al Router · VLANs permitidas:{' '}
                              <span className="text-purple-300 font-semibold">
                                {iface.allowedVlans?.join(', ') || '10, 20, 30, 50, 99'}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between mt-1 gap-2">
                              <span className="text-slate-400 text-[11px]">Asignar VLAN:</span>
                              <select
                                value={iface.vlanId || 10}
                                onChange={(e) =>
                                  onPortVlanChange?.(node.id, iface.name, Number(e.target.value))
                                }
                                className="bg-slate-950 border border-slate-700 text-sky-300 rounded px-2 py-0.5 text-xs font-semibold focus:outline-none cursor-pointer"
                              >
                                <option value={10}>VLAN 10 (Aula 1 - Informática)</option>
                                <option value={20}>VLAN 20 (Aula 2 - Diseño)</option>
                                <option value={30}>VLAN 30 (Aula 3 - Robótica)</option>
                                <option value={99}>VLAN 99 (Aislada / Prueba Segmentación)</option>
                              </select>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Switch CAM Table with VLAN IDs */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-300 font-semibold font-sans">
                        Tabla CAM de Direcciones MAC (Filtrado IEEE 802.1Q):
                      </span>
                      <span className="text-slate-500 text-[11px]">
                        {node.macTable?.length || 0} entradas registradas
                      </span>
                    </div>

                    <table className="w-full text-left border-collapse border border-slate-800 bg-slate-950 rounded-lg overflow-hidden">
                      <thead className="bg-slate-900 text-slate-400 text-[11px]">
                        <tr>
                          <th className="p-2.5">VLAN ID</th>
                          <th className="p-2.5">Dirección MAC</th>
                          <th className="p-2.5">Puerto</th>
                          <th className="p-2.5">Tipo</th>
                          <th className="p-2.5 text-right">Antigüedad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {node.macTable && node.macTable.length > 0 ? (
                          node.macTable.map((entry, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/60">
                              <td className="p-2.5">
                                <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800 font-bold text-[10px]">
                                  VLAN {entry.vlan ?? 10}
                                </span>
                              </td>
                              <td className="p-2.5 font-mono text-sky-300">{entry.mac}</td>
                              <td className="p-2.5 font-semibold text-emerald-400">{entry.port}</td>
                              <td className="p-2.5 text-slate-400">{entry.type || 'DYNAMIC'}</td>
                              <td className="p-2.5 text-right text-slate-400">{entry.ageSeconds}s</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-slate-500 font-sans">
                              Tabla CAM vacía. Se poblará dinámicamente cuando los equipos envíen tráfico.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Router Routing Table */}
              {node.type === 'router' && (
                <div>
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 mb-3 text-slate-400 font-sans text-xs leading-relaxed">
                    <span className="text-slate-200 font-semibold">Tabla de Enrutamiento L3:</span> Mapea prefijos de red a interfaces de salida y gateways de siguiente salto (Next-Hop).
                  </div>

                  <table className="w-full text-left border-collapse border border-slate-800 bg-slate-950 rounded-lg overflow-hidden">
                    <thead className="bg-slate-900 text-slate-400 text-[11px]">
                      <tr>
                        <th className="p-2">Red Destino</th>
                        <th className="p-2">Máscara</th>
                        <th className="p-2">Gateway</th>
                        <th className="p-2">Interfaz</th>
                        <th className="p-2 text-right">Métrica</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {node.routingTable?.map((route, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/60">
                          <td className="p-2 font-mono text-sky-400">{route.destination}</td>
                          <td className="p-2 font-mono text-slate-400">{route.mask}</td>
                          <td className="p-2 font-mono text-emerald-400">{route.gateway}</td>
                          <td className="p-2 text-slate-300 font-semibold">{route.interfaceName}</td>
                          <td className="p-2 text-right text-slate-400">{route.metric}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* PC / Server ARP Table */}
              {node.type !== 'switch' && node.type !== 'router' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 font-sans">Tabla Caché ARP (Resolución IP a MAC):</span>
                    {onFlushArp && (
                      <button
                        onClick={() => onFlushArp(node.id)}
                        className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] transition-colors"
                      >
                        <RefreshCw size={12} />
                        <span>Vaciar ARP (`arp -d`)</span>
                      </button>
                    )}
                  </div>

                  <table className="w-full text-left border-collapse border border-slate-800 bg-slate-950 rounded-lg overflow-hidden">
                    <thead className="bg-slate-900 text-slate-400 text-[11px]">
                      <tr>
                        <th className="p-2.5">Dirección IP</th>
                        <th className="p-2.5">Dirección MAC Física</th>
                        <th className="p-2.5">Tipo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {node.arpTable && node.arpTable.length > 0 ? (
                        node.arpTable.map((entry, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/60">
                            <td className="p-2.5 font-mono text-sky-400">{entry.ip}</td>
                            <td className="p-2.5 font-mono text-emerald-400">{entry.mac}</td>
                            <td className="p-2.5 text-slate-400">{entry.type}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-slate-500 font-sans">
                            Caché ARP vacía. Ejecuta un ping para ver el descubrimiento ARP.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Firewall ACLs (Routers) */}
          {activeTab === 'firewall' && node.firewallRules && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-slate-400 font-sans text-xs leading-relaxed">
                  Listas de Control de Acceso (ACLs) y Reglas de Seguridad perimetral configuradas en el router:
                </div>
                {onOpenAclEditor && (
                  <button
                    onClick={() => {
                      onOpenAclEditor(node.id);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors shrink-0 shadow-sm"
                  >
                    <Shield size={13} />
                    <span>Abrir Editor Completo ACL</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {node.firewallRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`p-3.5 rounded-lg border transition-colors ${
                      rule.enabled
                        ? rule.action === 'DROP'
                          ? 'bg-rose-950/20 border-rose-800/60'
                          : 'bg-emerald-950/20 border-emerald-800/60'
                        : 'bg-slate-950 border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield size={16} className={rule.action === 'DROP' ? 'text-rose-400' : 'text-emerald-400'} />
                        <span className="font-semibold text-slate-200 font-sans">{rule.description}</span>
                      </div>
                      <button
                        onClick={() => onToggleFirewallRule && onToggleFirewallRule(node.id, rule.id)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase transition-colors ${
                          rule.enabled
                            ? rule.action === 'DROP'
                              ? 'bg-rose-600 text-white'
                              : 'bg-emerald-600 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {rule.enabled ? 'ACTIVA (Bloqueando)' : 'DESACTIVADA'}
                      </button>
                    </div>

                    <div className="mt-2 text-[11px] text-slate-400 grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500">Origen:</span> {rule.sourceSubnet}
                      </div>
                      <div>
                        <span className="text-slate-500">Destino:</span> {rule.destSubnet}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: Stats */}
          {activeTab === 'stats' && (
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-center">
                <div className="text-slate-500 mb-1">Paquetes Enviados</div>
                <div className="text-xl font-bold text-sky-400 tabular-nums">{node.stats.packetsSent}</div>
              </div>
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-center">
                <div className="text-slate-500 mb-1">Paquetes Recibidos</div>
                <div className="text-xl font-bold text-emerald-400 tabular-nums">{node.stats.packetsReceived}</div>
              </div>
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-center">
                <div className="text-slate-500 mb-1">Paquetes Descartados</div>
                <div className="text-xl font-bold text-rose-400 tabular-nums">{node.stats.packetsDropped}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
