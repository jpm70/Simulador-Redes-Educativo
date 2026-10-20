import React, { useState } from 'react';
import { X, Send, Sliders, Shield, Zap, AlertTriangle, Play, HelpCircle, Layers } from 'lucide-react';
import { NetworkNode, ProtocolType, SimulatedPacket } from '../types/network';

interface PacketBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: NetworkNode[];
  onSendCustomPacket: (packetConfig: {
    sourceNodeId: string;
    targetNodeId: string;
    protocol: ProtocolType;
    ttl: number;
    payloadText: string;
  }) => void;
}

export const PacketBuilderModal: React.FC<PacketBuilderProps> = ({
  isOpen,
  onClose,
  nodes,
  onSendCustomPacket,
}) => {
  const eligibleSources = nodes.filter((n) => n.type === 'pc' || n.type === 'mobile' || n.type === 'server');
  const eligibleTargets = nodes.filter((n) => n.type === 'pc' || n.type === 'mobile' || n.type === 'server' || n.type === 'router');

  const [sourceId, setSourceId] = useState<string>(eligibleSources[0]?.id || 'pc-101');
  const [targetId, setTargetId] = useState<string>(eligibleTargets.find((n) => n.id !== sourceId)?.id || 'srv-web');
  const [protocol, setProtocol] = useState<ProtocolType>('ICMP');
  const [ttl, setTtl] = useState<number>(64);
  const [payloadText, setPayloadText] = useState<string>('Test Packet PDU');

  if (!isOpen) return null;

  const sourceNode = nodes.find((n) => n.id === sourceId);
  const targetNode = nodes.find((n) => n.id === targetId);

  const handleSend = () => {
    onSendCustomPacket({
      sourceNodeId: sourceId,
      targetNodeId: targetId,
      protocol,
      ttl,
      payloadText,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-950 border border-emerald-800/60 rounded-lg text-emerald-400">
              <Send size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Inyector Didáctico de Paquetes PDU</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Packet Crafter L2/L3/L4
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Construye y envía una trama personalizada para experimentar con enrutamiento, VLANs y TTL.
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

        {/* Form Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Source Node */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                1. Dispositivo Origen (Transmisor):
              </label>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-sky-400 focus:outline-none focus:border-sky-500"
              >
                {eligibleSources.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} ({n.primaryIp || n.type}) - {n.label}
                  </option>
                ))}
              </select>
              {sourceNode && (
                <div className="text-[11px] text-slate-500 font-mono">
                  MAC: {sourceNode.primaryMac} · IP: {sourceNode.primaryIp || 'N/A'}
                </div>
              )}
            </div>

            {/* Target Node */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                2. Dispositivo Destino (Receptor):
              </label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
              >
                {eligibleTargets
                  .filter((n) => n.id !== sourceId)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} ({n.primaryIp || n.type}) - {n.label}
                    </option>
                  ))}
              </select>
              {targetNode && (
                <div className="text-[11px] text-slate-500 font-mono">
                  MAC: {targetNode.primaryMac} · IP: {targetNode.primaryIp || 'N/A'}
                </div>
              )}
            </div>
          </div>

          {/* Protocol selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">
              3. Protocolo de Red a Simular:
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { proto: 'ICMP', label: 'ICMP Echo (Ping)', desc: 'Capa 3 / RTT' },
                { proto: 'DNS', label: 'DNS Query (UDP/53)', desc: 'Resolución Nombre' },
                { proto: 'HTTP', label: 'HTTP GET (TCP/80)', desc: 'Web Campus' },
                { proto: 'ARP', label: 'ARP Request (L2)', desc: 'Difusión MAC' },
              ].map((p) => (
                <button
                  key={p.proto}
                  type="button"
                  onClick={() => setProtocol(p.proto as ProtocolType)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    protocol === p.proto
                      ? 'bg-sky-950/80 border-sky-500 text-sky-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="font-bold text-xs">{p.label}</div>
                  <div className="text-[10px] text-slate-500">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* TTL Slider (Time to live) */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-200">
                  Campo TTL en Cabecera IP (Time To Live):
                </span>
                <p className="text-[11px] text-slate-400">
                  Número de saltos máximos antes de que un router descarte el paquete.
                </p>
              </div>
              <span className="font-mono text-base font-bold text-sky-400">
                TTL = {ttl}
              </span>
            </div>

            <input
              type="range"
              min={1}
              max={64}
              value={ttl}
              onChange={(e) => setTtl(parseInt(e.target.value, 10))}
              className="w-full accent-sky-500 cursor-pointer"
            />

            {ttl <= 2 && (
              <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/40 p-2.5 rounded border border-amber-800/60">
                <AlertTriangle size={15} className="shrink-0" />
                <span>
                  <strong>¡Experimento de Red!</strong> Con TTL={ttl}, si el paquete atraviesa routers L3, el TTL llegará a 0 y se generará un mensaje <em>ICMP Time Exceeded (Cód. 11)</em> como en Traceroute.
                </span>
              </div>
            )}
          </div>

          {/* Payload Message */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Datos de Aplicación / Carga Útil (Payload):
            </label>
            <input
              type="text"
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              placeholder="Mensaje de prueba..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-950 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-slate-200"
          >
            Cancelar
          </button>

          <button
            onClick={handleSend}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors shadow-md"
          >
            <Play size={14} fill="currentColor" />
            <span>Inyectar y Simular Paquete</span>
          </button>
        </div>
      </div>
    </div>
  );
};
