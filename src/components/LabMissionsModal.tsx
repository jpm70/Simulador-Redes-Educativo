import React from 'react';
import { LabMission } from '../types/network';
import { LAB_MISSIONS } from '../data/topologyData';
import { BookOpen, CheckCircle, ArrowRight, X, Play, Award } from 'lucide-react';

interface LabModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchMission: (mission: LabMission) => void;
  completedMissionIds: string[];
}

export const LabMissionsModal: React.FC<LabModalProps> = ({
  isOpen,
  onClose,
  onLaunchMission,
  completedMissionIds,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-950 border border-indigo-800/60 rounded-lg text-indigo-400">
              <BookOpen size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Laboratorios y Misiones de Red</h2>
              <p className="text-xs text-slate-400">
                Escenarios guiados para comprender el funcionamiento real de protocolos TCP/IP, switches y routers.
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

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between p-3.5 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <Award className="text-amber-400" size={16} />
              <span>Progreso de Aprendizaje:</span>
            </div>
            <div className="font-semibold text-sky-400">
              {completedMissionIds.length} de {LAB_MISSIONS.length} misiones completadas
            </div>
          </div>

          <div className="space-y-4">
            {LAB_MISSIONS.map((mission, index) => {
              const isCompleted = completedMissionIds.includes(mission.id);

              return (
                <div
                  key={mission.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isCompleted
                      ? 'bg-slate-950/80 border-emerald-900/50'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {mission.difficulty}
                        </span>
                        <h3 className="text-sm font-bold text-slate-100">{mission.title}</h3>
                        {isCompleted && (
                          <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                            <CheckCircle size={14} /> Completado
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{mission.description}</p>
                    </div>

                    <button
                      onClick={() => {
                        onLaunchMission(mission);
                        onClose();
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors shadow-sm"
                    >
                      <Play size={13} fill="currentColor" />
                      <span>Iniciar Misión</span>
                    </button>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 font-medium">Objetivos:</span>
                      <ul className="mt-1 space-y-1 text-slate-300 list-disc list-inside">
                        {mission.objectives.slice(0, 2).map((obj, i) => (
                          <li key={i}>{obj}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Comando Sugerido:</span>
                      <div className="mt-1 font-mono text-[11px] bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800 text-sky-300">
                        {mission.suggestedCommand}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
