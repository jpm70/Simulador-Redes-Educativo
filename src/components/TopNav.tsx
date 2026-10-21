import React, { useRef } from 'react';
import {
  Network,
  BookOpen,
  ExternalLink,
  Calculator,
  Send,
  FileText,
  Volume2,
  VolumeX,
  Download,
  Upload,
  ShieldAlert,
} from 'lucide-react';

interface TopNavProps {
  activeView: 'topology' | 'terminal' | 'wireshark' | 'telemetry';
  setActiveView: (view: 'topology' | 'terminal' | 'wireshark' | 'telemetry') => void;
  onOpenLabs: () => void;
  onOpenSubnets: () => void;
  onOpenPacketBuilder: () => void;
  onOpenReport: () => void;
  onOpenAclEditor: () => void;
  onExportLab: () => void;
  onImportLab: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  packetCount: number;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeView,
  setActiveView,
  onOpenLabs,
  onOpenSubnets,
  onOpenPacketBuilder,
  onOpenReport,
  onOpenAclEditor,
  onExportLab,
  onImportLab,
  isMuted,
  onToggleMute,
  packetCount,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="flex items-center justify-between gap-4 px-4 py-2.5 bg-slate-950 border-b border-slate-800 shrink-0">
      {/* Zone 1: Logo (sin deformar) & Brand Link to unfantasmaenelsistema.com */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="https://www.unfantasmaenelsistema.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/50 transition-all group shrink-0"
          title="Visitar Un Fantasma en el Sistema (https://www.unfantasmaenelsistema.com/)"
        >
          <img
            src={`${import.meta.env.BASE_URL}assets/aistudio/icono_81a3db5b.png`}
            alt="Logo Un Fantasma en el Sistema"
            className="w-8 h-8 aspect-square object-contain shrink-0 group-hover:scale-105 transition-transform"
          />
          <div className="flex flex-col text-left">
            <span className="text-xs font-bold text-slate-100 group-hover:text-sky-300 transition-colors leading-tight flex items-center gap-1">
              Un Fantasma en el Sistema
              <ExternalLink size={11} className="text-slate-500 group-hover:text-sky-400 transition-colors" />
            </span>
            <span className="text-[10px] text-slate-400 font-mono leading-tight">
              unfantasmaenelsistema.com
            </span>
          </div>
        </a>

        <div className="h-6 w-px bg-slate-800 hidden lg:block" />

        <div className="hidden lg:flex items-center gap-2 text-xs font-semibold text-slate-300">
          <Network size={15} className="text-sky-400" />
          <span>Simulador de Redes</span>
        </div>
      </div>

      {/* Zone 2: Navigation Items & Educational Tools */}
      <nav className="hidden md:flex items-center gap-3 lg:gap-4 text-xs font-medium text-slate-400">
        <button
          onClick={() => setActiveView('topology')}
          className={`hover:text-slate-200 transition-colors whitespace-nowrap shrink-0 ${
            activeView === 'topology' ? 'text-sky-400 font-semibold' : ''
          }`}
        >
          Topología
        </button>
        <button
          onClick={() => setActiveView('terminal')}
          className={`hover:text-slate-200 transition-colors whitespace-nowrap shrink-0 ${
            activeView === 'terminal' ? 'text-sky-400 font-semibold' : ''
          }`}
        >
          Terminal
        </button>
        <button
          onClick={() => setActiveView('wireshark')}
          className={`hover:text-slate-200 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            activeView === 'wireshark' ? 'text-sky-400 font-semibold' : ''
          }`}
        >
          <span>Wireshark</span>
          {packetCount > 0 && (
            <span className="font-mono text-[10px] bg-sky-950 text-sky-400 px-1.5 py-0.2 rounded-full border border-sky-800">
              {packetCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveView('telemetry')}
          className={`hover:text-slate-200 transition-colors whitespace-nowrap shrink-0 ${
            activeView === 'telemetry' ? 'text-sky-400 font-semibold' : ''
          }`}
        >
          Telemetría
        </button>

        <span className="text-slate-700">|</span>

        {/* Specialized Educational Tools */}
        <button
          onClick={onOpenSubnets}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-sky-300 hover:text-white bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-md transition-colors"
          title="Calculadora y Mapa de Subredes VLSM"
        >
          <Calculator size={13} className="text-sky-400" />
          <span>Subredes & VLSM</span>
        </button>

        <button
          onClick={onOpenPacketBuilder}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-emerald-300 hover:text-white bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-md transition-colors"
          title="Inyector de Paquetes PDU (Cisco Packet Tracer style)"
        >
          <Send size={13} className="text-emerald-400" />
          <span>Inyector PDU</span>
        </button>

        <button
          onClick={onOpenReport}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-indigo-300 hover:text-white bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-md transition-colors"
          title="Exportar Informe de Laboratorio en Markdown"
        >
          <FileText size={13} className="text-indigo-400" />
          <span>Informe</span>
        </button>

        <button
          onClick={onOpenAclEditor}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-rose-300 hover:text-white bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-md transition-colors"
          title="Editor de Listas de Control de Acceso (ACLs) en Routers (Cisco Extended ACL)"
        >
          <ShieldAlert size={13} className="text-rose-400" />
          <span>Editor ACL</span>
        </button>
      </nav>

      {/* Zone 3: Primary Actions, JSON Lab Save/Load, Audio FX & Labs */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Lab JSON Export & Import Controls */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
          <button
            onClick={onExportLab}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
            title="Exportar configuración actual de la red (nodos y enlaces) a archivo .json descargable"
          >
            <Download size={13} className="text-sky-400" />
            <span className="hidden sm:inline">Exportar JSON</span>
          </button>
          <div className="h-3.5 w-px bg-slate-800 my-auto" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
            title="Cargar laboratorio personalizado desde archivo .json"
          >
            <Upload size={13} className="text-emerald-400" />
            <span className="hidden sm:inline">Cargar JSON</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={onImportLab}
            className="hidden"
          />
        </div>

        {/* Sound toggle button */}
        <button
          onClick={onToggleMute}
          className={`p-2 rounded-lg border transition-colors ${
            isMuted
              ? 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
              : 'bg-slate-900 border-slate-800 text-emerald-400 hover:text-emerald-300'
          }`}
          title={isMuted ? 'Activar Efectos de Sonido Didácticos' : 'Silenciar Efectos de Sonido'}
        >
          {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>

        <a
          href="https://www.unfantasmaenelsistema.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors whitespace-nowrap shadow-sm"
          title="Abrir web www.unfantasmaenelsistema.com"
        >
          <img
            src={`${import.meta.env.BASE_URL}assets/aistudio/icono_81a3db5b.png`}
            alt="Logo"
            className="w-4 h-4 aspect-square object-contain shrink-0"
          />
          <span>Web Oficial</span>
          <ExternalLink size={12} className="text-slate-400" />
        </a>

        <button
          onClick={onOpenLabs}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm"
        >
          <BookOpen size={13} />
          <span>Misiones Lab</span>
        </button>
      </div>
    </header>
  );
};
