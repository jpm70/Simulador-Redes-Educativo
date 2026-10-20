import React from 'react';
import { Play, Pause, SkipForward, RotateCcw, Activity, Radio, Zap } from 'lucide-react';
import { RouterInterconnectionMode } from '../types/network';

interface SummaryBarProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStepForward: () => void;
  speed: number;
  onChangeSpeed: (speed: number) => void;
  onResetSimulation: () => void;
  activePacketCount: number;
  totalDevicesCount: number;
  routerMode: RouterInterconnectionMode;
  onToggleRouterMode: () => void;
  avgLatency?: number;
}

export const NetworkSummaryBar: React.FC<SummaryBarProps> = ({
  isPlaying,
  onTogglePlay,
  onStepForward,
  speed,
  onChangeSpeed,
  onResetSimulation,
  activePacketCount,
  totalDevicesCount,
  routerMode,
  onToggleRouterMode,
  avgLatency,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-2.5 bg-slate-900 border-b border-slate-800 text-xs">
      {/* Simulation Playback Controls */}
      <div className="flex items-center gap-2">
        <span className="text-slate-500 font-semibold text-[11px] uppercase tracking-wider mr-1">
          Simulador:
        </span>
        <button
          onClick={onTogglePlay}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors ${
            isPlaying
              ? 'bg-amber-600 hover:bg-amber-500 text-white'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
          title={isPlaying ? 'Pausar simulación de paquetes' : 'Iniciar simulación'}
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} fill="currentColor" />}
          <span>{isPlaying ? 'Pausar' : 'Reanudar'}</span>
        </button>

        <button
          onClick={onStepForward}
          disabled={isPlaying}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg transition-colors"
          title="Avanzar un solo paso (Modo Paso a Paso)"
        >
          <SkipForward size={13} />
          <span>Paso a Paso</span>
        </button>

        {/* Speed Controls */}
        <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 ml-2">
          {[0.25, 0.5, 1, 2].map((s) => (
            <button
              key={s}
              onClick={() => onChangeSpeed(s)}
              className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                speed === s
                  ? 'bg-slate-800 text-sky-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        <button
          onClick={onResetSimulation}
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors ml-1"
          title="Reiniciar paquetes activos"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Network Segment Summary & Mode Selector */}
      <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
        {/* Router Mode Switcher */}
        <button
          onClick={onToggleRouterMode}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
            routerMode === 'interconnected'
              ? 'bg-indigo-950 text-indigo-300 border-indigo-800 hover:bg-indigo-900'
              : 'bg-amber-950 text-amber-300 border-amber-800 hover:bg-amber-900'
          }`}
          title="Alternar entre enlace troncal interconectado o redes independientes para cada router"
        >
          <Radio size={12} className={routerMode === 'interconnected' ? 'text-indigo-400' : 'text-amber-400'} />
          <span>
            {routerMode === 'interconnected' ? 'Troncal 10G: Conectado' : 'Redes: Independientes (Aisladas)'}
          </span>
        </button>

        <div className="hidden md:block">
          <span className="text-slate-500">Equipos:</span>{' '}
          <span className="text-slate-200 font-bold tabular-nums">{totalDevicesCount}</span>
        </div>
        <div className="hidden md:block">
          <span className="text-slate-500">Subredes:</span>{' '}
          <span className="text-slate-200 font-bold">6 VLANs</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity size={13} className={activePacketCount > 0 ? 'text-sky-400 animate-pulse' : 'text-slate-600'} />
          <span className="text-slate-500">En tránsito:</span>{' '}
          <span className="text-sky-400 font-bold tabular-nums">{activePacketCount} pkts</span>
        </div>
        {avgLatency !== undefined && (
          <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
            <Zap size={12} className="text-amber-400" />
            <span className="text-slate-500">Latencia media:</span>{' '}
            <span className="text-amber-300 font-bold tabular-nums">~{avgLatency} ms</span>
          </div>
        )}
      </div>
    </div>
  );
};
