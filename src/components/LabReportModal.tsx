import React, { useState } from 'react';
import { X, FileText, Download, Copy, Check, ExternalLink, Award, CheckCircle2, Clock } from 'lucide-react';
import { NetworkNode, NetworkLink, SimulatedPacket, LabMission } from '../types/network';
import { LAB_MISSIONS } from '../data/topologyData';

interface LabReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: NetworkNode[];
  links: NetworkLink[];
  packetLogs: SimulatedPacket[];
  completedMissionIds: string[];
}

export const LabReportModal: React.FC<LabReportModalProps> = ({
  isOpen,
  onClose,
  nodes,
  links,
  packetLogs,
  completedMissionIds,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const completedMissions = LAB_MISSIONS.filter((m) => completedMissionIds.includes(m.id));
  const avgLatency =
    links.length > 0
      ? (
          links
            .filter((l) => l.status === 'active')
            .reduce((acc, l) => acc + (l.currentLatency || l.latency || 1.0), 0) /
          Math.max(1, links.filter((l) => l.status === 'active').length)
        ).toFixed(2)
      : '2.4';

  const generateMarkdownReport = () => {
    const dateStr = new Date().toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' });
    let md = `# INFORME DE PRÁCTICAS DE LABORATORIO DE REDES\n`;
    md += `**Plataforma**: Simulador de Red Academia — [Un Fantasma en el Sistema](https://www.unfantasmaenelsistema.com/)\n`;
    md += `**Fecha de Emisión**: ${dateStr}\n\n`;
    md += `---\n\n`;

    md += `## 1. RESUMEN DE PROGRESO DE APRENDIZAJE\n`;
    md += `- **Misiones Completadas**: ${completedMissions.length} de ${LAB_MISSIONS.length} (${Math.round((completedMissions.length / LAB_MISSIONS.length) * 100)}%)\n`;
    md += `- **Paquetes Transmitidos e Inspeccionados**: ${packetLogs.length}\n`;
    md += `- **Latencia Media Estimada en la Topología**: ${avgLatency} ms\n\n`;

    md += `### Misiones de Laboratorio Realizadas:\n`;
    LAB_MISSIONS.forEach((m, idx) => {
      const isDone = completedMissionIds.includes(m.id);
      md += `${idx + 1}. [${isDone ? 'X' : ' '}] **${m.title}** (${m.difficulty})\n`;
      md += `   - *Descripción*: ${m.description}\n`;
      md += `   - *Comando clave*: \`${m.suggestedCommand}\`\n\n`;
    });

    md += `## 2. INVENTARIO Y CONFIGURACIÓN DE EQUIPOS DEL CAMPUS\n\n`;
    md += `| Dispositivo | Tipo | Zona / VLAN | Dirección IPv4 | Dirección MAC | Gateway |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    nodes.forEach((n) => {
      md += `| ${n.name} | ${n.type} | ${n.zone} | ${n.primaryIp || 'N/A (L2)'} | \`${n.primaryMac}\` | ${n.gateway || 'Local'} |\n`;
    });
    md += `\n`;

    md += `## 3. SEGMENTACIÓN LÓGICA DE SUBREDES & VLANs (IEEE 802.1Q)\n`;
    md += `- **VLAN 10**: Aula 1 Informática (\`192.168.10.0/24\` · Gateway \`192.168.10.1\`)\n`;
    md += `- **VLAN 20**: Aula 2 Informática (\`192.168.20.0/24\` · Gateway \`192.168.20.1\`)\n`;
    md += `- **VLAN 50**: Wi-Fi Invitados (\`172.16.50.0/24\` · Gateway \`172.16.50.1\` · Filtrado Firewall)\n`;
    md += `- **VLAN 100**: Administración y Servidores (\`192.168.100.0/24\` · Gateway \`192.168.100.1\`)\n`;
    md += `- **Troncal Inter-Router**: \`10.0.0.0/30\` (Punto a punto L3)\n\n`;

    md += `## 4. ANÁLISIS DE TRÁFICO CAPTURADO (WIRESHARK)\n`;
    if (packetLogs.length === 0) {
      md += `*No se registraron capturas de paquetes durante esta sesión.*\n\n`;
    } else {
      md += `| No. | Protocolo | Origen | Destino | RTT / Latencia | Resumen |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
      packetLogs.slice(-10).forEach((p, i) => {
        md += `| ${i + 1} | ${p.protocol} | ${p.layer3.sourceIP || p.layer2.sourceMac} | ${p.layer3.destIP || p.layer2.destMac} | ${p.totalLatencyMs || 2} ms | ${p.summary} |\n`;
      });
      md += `\n`;
    }

    md += `## 5. CONCLUSIONES DIDÁCTICAS\n`;
    md += `1. **Capa 2 vs Capa 3**: La conmutación de tramas mediante direcciones MAC y el etiquetado 802.1Q permite aislar dominios de difusión sin duplicar cableado físico.\n`;
    md += `2. **Latencia y Encolamiento**: La carga de tráfico en una subred influye directamente en el retardo de viaje de los paquetes.\n`;
    md += `3. **Seguridad Perimetral**: Las reglas de Firewall evitan el acceso no autorizado entre zonas de distinta confianza (como invitados hacia administración).\n\n`;
    md += `---\n*Documento generado automáticamente por el Simulador de Redes Educativo — https://www.unfantasmaenelsistema.com/*\n`;

    return md;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateMarkdownReport());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([generateMarkdownReport()], { type: 'text/markdown;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `informe-laboratorio-redes-${Date.now()}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-950 border border-indigo-800/60 rounded-lg text-indigo-400">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Generador de Informe de Práctica de Laboratorio</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                  Markdown / Exportación
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Exporta el progreso de tus misiones, la topología, el análisis Wireshark y conclusiones.
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

        {/* Preview of report */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <Award className="text-amber-400" size={16} />
              <span>Progreso: <strong>{completedMissions.length} de {LAB_MISSIONS.length} misiones</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="text-sky-400" size={14} />
              <span>{packetLogs.length} paquetes analizados</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">
              Vista Previa del Informe de Práctica:
            </label>
            <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-300 overflow-x-auto max-h-[380px] leading-relaxed whitespace-pre-wrap select-all">
              {generateMarkdownReport()}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-950 border-t border-slate-800">
          <a
            href="https://www.unfantasmaenelsistema.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-sky-400 transition-colors"
          >
            <img
              src={`${import.meta.env.BASE_URL}assets/aistudio/icono_81a3db5b.png`}
              alt="Logo"
              className="w-4 h-4 aspect-square object-contain"
            />
            <span>unfantasmaenelsistema.com</span>
            <ExternalLink size={11} />
          </a>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors border border-slate-700"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copied ? '¡Copiado!' : 'Copiar Markdown'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
            >
              <Download size={14} />
              <span>Descargar Archivo (.md)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
