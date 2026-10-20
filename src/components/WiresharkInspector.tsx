import React, { useState } from 'react';
import { SimulatedPacket, ProtocolType } from '../types/network';
import { Network, Filter, Trash2, ChevronDown, ChevronRight, Info, Layers, Route, Zap } from 'lucide-react';

interface WiresharkProps {
  packetLogs: SimulatedPacket[];
  onClearLogs: () => void;
  onHighlightPath?: (packet: SimulatedPacket) => void;
}

export const WiresharkInspector: React.FC<WiresharkProps> = ({
  packetLogs,
  onClearLogs,
  onHighlightPath,
}) => {
  const [selectedPacketId, setSelectedPacketId] = useState<string | null>(null);
  const [filterProtocol, setFilterProtocol] = useState<string>('ALL');
  const [expandedLayer, setExpandedLayer] = useState<Record<string, boolean>>({
    l2: true,
    l3: true,
    l4: true,
    l7: true,
  });

  const toggleLayer = (layer: string) => {
    setExpandedLayer((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const filteredPackets = packetLogs.filter((p) => {
    if (filterProtocol === 'ALL') return true;
    return p.protocol === filterProtocol;
  });

  const selectedPacket = packetLogs.find((p) => p.id === selectedPacketId) || packetLogs[packetLogs.length - 1];

  const getProtocolColor = (proto: ProtocolType) => {
    switch (proto) {
      case 'ARP': return 'bg-amber-950 text-amber-300 border-amber-800/60';
      case 'ICMP': return 'bg-sky-950 text-sky-300 border-sky-800/60';
      case 'DNS': return 'bg-purple-950 text-purple-300 border-purple-800/60';
      case 'HTTP': return 'bg-orange-950 text-orange-300 border-orange-800/60';
      case 'TCP': return 'bg-pink-950 text-pink-300 border-pink-800/60';
      default: return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden font-mono text-xs shadow-2xl">
      {/* Header & Filter Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Network size={15} className="text-emerald-400" />
          <span className="font-semibold text-slate-200">Inspector de Paquetes (Estilo Wireshark)</span>
          <span className="text-slate-500">({packetLogs.length} capturados)</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Protocol Filter tabs */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800">
            {['ALL', 'ICMP', 'ARP', 'DNS', 'HTTP', 'TCP'].map((proto) => (
              <button
                key={proto}
                onClick={() => setFilterProtocol(proto)}
                className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                  filterProtocol === proto
                    ? 'bg-slate-800 text-sky-400 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {proto}
              </button>
            ))}
          </div>

          <button
            onClick={onClearLogs}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
            title="Limpiar captura"
          >
            <Trash2 size={13} />
            <span>Limpiar</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout: Top Packet Table, Bottom Layer Breakdown */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
        {/* Packet Stream Table (Left or Top) */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-900 sticky top-0 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-1.5 px-3 w-12 text-center">No.</th>
                <th className="py-1.5 px-3 w-28">Origen</th>
                <th className="py-1.5 px-3 w-28">Destino</th>
                <th className="py-1.5 px-3 w-16 text-center">Proto</th>
                <th className="py-1.5 px-3 w-14 text-right">Bytes</th>
                <th className="py-1.5 px-3">Información</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-[11.5px]">
              {filteredPackets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No hay paquetes capturados en este momento.
                    <br />
                    Lanza un comando en la terminal (ej. <span className="text-sky-400">ping 192.168.10.12</span>) para ver tráfico.
                  </td>
                </tr>
              ) : (
                filteredPackets.map((pkt, idx) => {
                  const isSelected = selectedPacket?.id === pkt.id;
                  return (
                    <tr
                      key={pkt.id}
                      onClick={() => setSelectedPacketId(pkt.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-sky-950/70 text-sky-200'
                          : 'hover:bg-slate-900 text-slate-300'
                      }`}
                    >
                      <td className="py-1 px-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                      <td className="py-1 px-3 font-mono truncate max-w-[120px]">
                        {pkt.layer3.sourceIP || pkt.layer2.sourceMac}
                      </td>
                      <td className="py-1 px-3 font-mono truncate max-w-[120px]">
                        {pkt.layer3.destIP || pkt.layer2.destMac}
                      </td>
                      <td className="py-1 px-3 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getProtocolColor(pkt.protocol)}`}>
                          {pkt.protocol}
                        </span>
                        {pkt.layer2.vlanId && (
                          <span className="block text-[9px] font-mono text-indigo-400 mt-0.5">
                            VLAN {pkt.layer2.vlanId}
                          </span>
                        )}
                      </td>
                      <td className="py-1 px-3 text-right text-slate-400 tabular-nums">{pkt.sizeBytes}</td>
                      <td className="py-1 px-3 truncate max-w-xs">{pkt.summary}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Detailed OSI Layers & Didactic Explanation (Right or Bottom) */}
        <div className="w-full lg:w-96 flex flex-col bg-slate-900/60 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center gap-1.5 text-slate-200 font-semibold border-b border-slate-800 pb-2">
            <Layers size={15} className="text-sky-400" />
            <span>Desglose por Capas (Modelo OSI)</span>
          </div>

          {!selectedPacket ? (
            <div className="text-slate-500 text-center py-6">
              Selecciona un paquete de la tabla para ver su disección completa en cabeceras.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Educational Concept Banner */}
              <div className="p-3 bg-sky-950/40 border border-sky-800/50 rounded-lg text-sky-200 text-[11px] leading-relaxed">
                <div className="flex items-center gap-1.5 font-bold mb-1 text-sky-300">
                  <Info size={14} />
                  <span>Explicación Didáctica</span>
                </div>
                {selectedPacket.steps[0]?.explanation || selectedPacket.summary}
              </div>

              {/* Latency and RTT Metric */}
              {selectedPacket.totalLatencyMs !== undefined && selectedPacket.totalLatencyMs > 0 && (
                <div className="flex items-center justify-between text-[11px] p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-slate-400 flex items-center gap-1 font-mono">
                    <Zap size={12} className="text-amber-400" />
                    Retardo / RTT del Paquete:
                  </span>
                  <span className="font-mono text-amber-300 font-bold">
                    {selectedPacket.totalLatencyMs} ms
                  </span>
                </div>
              )}

              {/* Highlight Path on Topology Button */}
              {onHighlightPath && selectedPacket.steps && selectedPacket.steps.length > 0 && (
                <button
                  onClick={() => onHighlightPath(selectedPacket)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  <Route size={14} />
                  <span>Resaltar Camino en la Topología ({selectedPacket.steps.length} saltos)</span>
                </button>
              )}

              {/* Layer 2: Ethernet Frame */}
              <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
                <button
                  onClick={() => toggleLayer('l2')}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-900 text-slate-200 hover:bg-slate-850 font-medium"
                >
                  <span className="flex items-center gap-1.5">
                    {expandedLayer.l2 ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Capa 2 · Trama Ethernet II
                  </span>
                  <span className="text-slate-500 text-[10px]">{selectedPacket.layer2.etherType}</span>
                </button>
                {expandedLayer.l2 && (
                  <div className="p-3 space-y-1 text-slate-400 text-[11px] border-t border-slate-800/60 font-mono">
                    <div>
                      <span className="text-slate-500">MAC Destino:</span>{' '}
                      <span className="text-slate-200">{selectedPacket.layer2.destMac}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">MAC Origen:</span>{' '}
                      <span className="text-slate-200">{selectedPacket.layer2.sourceMac}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Tipo (EtherType):</span>{' '}
                      <span className="text-emerald-400">{selectedPacket.layer2.etherType}</span>
                    </div>
                    {selectedPacket.layer2.vlanId && (
                      <div className="mt-2 pt-2 border-t border-slate-800/80">
                        <div className="flex items-center gap-1.5 font-bold text-indigo-400 mb-1">
                          <span>Cabecera IEEE 802.1Q (Virtual LAN Tag)</span>
                          <span className="px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px]">
                            {selectedPacket.layer2.isTagged ? 'Tagged (Troncal / Segmentado)' : 'Access VLAN'}
                          </span>
                        </div>
                        <div className="pl-2 space-y-0.5 text-slate-300">
                          <div>
                            <span className="text-slate-500">TPID (Protocol ID):</span>{' '}
                            <span className="text-indigo-300">{selectedPacket.layer2.tpid || '0x8100 (IEEE 802.1Q)'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Prioridad PCP:</span>{' '}
                            <span className="text-slate-300">{selectedPacket.layer2.priority ?? 0} (Best Effort / Default)</span>
                          </div>
                          <div>
                            <span className="text-slate-500">VLAN ID (VID):</span>{' '}
                            <span className="text-emerald-400 font-bold">{selectedPacket.layer2.vlanId}</span>{' '}
                            <span className="text-slate-500">
                              ({selectedPacket.layer2.vlanId === 10
                                ? 'Aula 1 Informática'
                                : selectedPacket.layer2.vlanId === 20
                                ? 'Aula 2 Diseño'
                                : selectedPacket.layer2.vlanId === 30
                                ? 'Aula 3 Robótica'
                                : selectedPacket.layer2.vlanId === 50
                                ? 'Wi-Fi Invitados'
                                : selectedPacket.layer2.vlanId === 100
                                ? 'Admin Zona 1 (Secretaría)'
                                : selectedPacket.layer2.vlanId === 200
                                ? 'Admin Zona 2 (Campus Web)'
                                : selectedPacket.layer2.vlanId === 99
                                ? 'VLAN Aislada'
                                : 'Segmento Red'})
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Layer 3: IPv4 Packet */}
              {selectedPacket.layer3.destIP && (
                <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
                  <button
                    onClick={() => toggleLayer('l3')}
                    className="w-full flex items-center justify-between px-3 py-2 bg-slate-900 text-slate-200 hover:bg-slate-850 font-medium"
                  >
                    <span className="flex items-center gap-1.5">
                      {expandedLayer.l3 ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      Capa 3 · Protocolo IP (IPv4)
                    </span>
                    <span className="text-slate-500 text-[10px]">TTL: {selectedPacket.layer3.ttl}</span>
                  </button>
                  {expandedLayer.l3 && (
                    <div className="p-3 space-y-1 text-slate-400 text-[11px] border-t border-slate-800/60 font-mono">
                      <div>
                        <span className="text-slate-500">IP Origen:</span>{' '}
                        <span className="text-sky-300">{selectedPacket.layer3.sourceIP}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">IP Destino:</span>{' '}
                        <span className="text-sky-300">{selectedPacket.layer3.destIP}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Time to Live (TTL):</span>{' '}
                        <span className="text-slate-200">{selectedPacket.layer3.ttl} saltos</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Protocolo L4:</span>{' '}
                        <span className="text-amber-300">
                          {selectedPacket.layer3.protocolName} ({selectedPacket.layer3.protocolNumber})
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Layer 4: Transport (TCP / UDP / ICMP) */}
              {(selectedPacket.layer4.icmpType || selectedPacket.layer4.destPort) && (
                <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
                  <button
                    onClick={() => toggleLayer('l4')}
                    className="w-full flex items-center justify-between px-3 py-2 bg-slate-900 text-slate-200 hover:bg-slate-850 font-medium"
                  >
                    <span className="flex items-center gap-1.5">
                      {expandedLayer.l4 ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      Capa 4 · {selectedPacket.protocol} ({selectedPacket.layer4.icmpType ? 'Control' : 'Transporte'})
                    </span>
                  </button>
                  {expandedLayer.l4 && (
                    <div className="p-3 space-y-1 text-slate-400 text-[11px] border-t border-slate-800/60 font-mono">
                      {selectedPacket.layer4.icmpType && (
                        <div>
                          <span className="text-slate-500">Tipo ICMP:</span>{' '}
                          <span className="text-sky-300 font-semibold">{selectedPacket.layer4.icmpType}</span>
                        </div>
                      )}
                      {selectedPacket.layer4.sourcePort && (
                        <div>
                          <span className="text-slate-500">Puerto Origen:</span>{' '}
                          <span className="text-slate-200">{selectedPacket.layer4.sourcePort}</span>
                        </div>
                      )}
                      {selectedPacket.layer4.destPort && (
                        <div>
                          <span className="text-slate-500">Puerto Destino:</span>{' '}
                          <span className="text-slate-200">{selectedPacket.layer4.destPort}</span>
                        </div>
                      )}
                      {selectedPacket.layer4.flags && (
                        <div>
                          <span className="text-slate-500">Flags TCP:</span>{' '}
                          <span className="text-pink-400">[{selectedPacket.layer4.flags.join(', ')}]</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Layer 7: Application / Payload */}
              <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
                <button
                  onClick={() => toggleLayer('l7')}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-900 text-slate-200 hover:bg-slate-850 font-medium"
                >
                  <span className="flex items-center gap-1.5">
                    {expandedLayer.l7 ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Capa 7 · Aplicación ({selectedPacket.layer7.application})
                  </span>
                </button>
                {expandedLayer.l7 && (
                  <div className="p-3 space-y-1 text-slate-400 text-[11px] border-t border-slate-800/60 font-mono whitespace-pre-wrap">
                    <div className="text-slate-200 font-medium">{selectedPacket.layer7.message}</div>
                    {selectedPacket.layer7.payload && (
                      <div className="mt-2 pt-2 border-t border-slate-800/80 text-[10.5px] text-emerald-300">
                        {JSON.stringify(selectedPacket.layer7.payload, null, 2)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
