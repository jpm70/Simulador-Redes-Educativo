import React, { useState, useRef, useEffect } from 'react';
import { NetworkNode } from '../types/network';
import { Terminal, Send, Trash2, HelpCircle, ChevronRight, Sparkles } from 'lucide-react';

interface TerminalProps {
  currentNode: NetworkNode;
  allNodes: NetworkNode[];
  onSelectNode: (nodeId: string) => void;
  onExecuteCommand: (command: string, node: NetworkNode) => void;
  historyLogs: { id: string; text: string; type: 'cmd' | 'output' | 'error' | 'success' | 'info' }[];
  onClearHistory: () => void;
}

export const TerminalConsole: React.FC<TerminalProps> = ({
  currentNode,
  allNodes,
  onSelectNode,
  onExecuteCommand,
  historyLogs,
  onClearHistory,
}) => {
  const [inputVal, setInputVal] = useState<string>('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll when logs change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [historyLogs]);

  // Focus input on mount or node change
  useEffect(() => {
    inputRef.current?.focus();
  }, [currentNode]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputVal.trim();
    if (!trimmed) return;

    // Add to history
    setCmdHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed)]);
    setHistoryIndex(-1);

    // Execute
    onExecuteCommand(trimmed, currentNode);
    setInputVal('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0 && historyIndex < cmdHistory.length - 1) {
        const nextIndex = historyIndex + 1;
        setHistoryIndex(nextIndex);
        setInputVal(cmdHistory[nextIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setInputVal(cmdHistory[nextIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputVal('');
      }
    }
  };

  // Quick suggestions based on selected node
  const quickCommands =
    currentNode.type === 'switch'
      ? [
          { label: 'mac-table (VLANs CAM)', cmd: 'mac-table' },
          { label: 'show vlan (Puertos)', cmd: 'show vlan' },
          { label: 'Aislar Puerto 3 (VLAN 99)', cmd: 'vlan set port3 99' },
          { label: 'Restaurar Puerto 3', cmd: currentNode.zone === 'aula1' ? 'vlan set port3 10' : currentNode.zone === 'aula2' ? 'vlan set port3 20' : 'vlan set port3 30' },
          { label: 'help', cmd: 'help' },
        ]
      : [
          { label: 'ping Aula 1 (Local)', cmd: 'ping 192.168.10.12' },
          { label: 'ping Aula 2 (Enrutado)', cmd: 'ping 192.168.20.11' },
          { label: 'ping Admin (Firewall Test)', cmd: 'ping 192.168.100.10' },
          { label: 'mac-table (Switch Local)', cmd: 'mac-table' },
          { label: 'show vlan', cmd: 'show vlan' },
          { label: 'curl Campus Web', cmd: 'curl http://campus.academia.edu' },
          { label: 'nslookup Campus', cmd: 'nslookup campus.academia.edu' },
          { label: 'traceroute ERP', cmd: 'traceroute 192.168.100.20' },
          { label: 'arp -a', cmd: 'arp -a' },
          { label: 'ipconfig', cmd: 'ipconfig' },
        ];

  const getPromptUser = () => {
    if (currentNode.type === 'switch') return 'switch-admin';
    if (currentNode.zone === 'wifi-guest') return 'invitado';
    if (currentNode.zone.startsWith('admin')) return 'admin';
    if (currentNode.type === 'router') return 'root';
    return 'estudiante';
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden font-mono text-xs shadow-2xl">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal size={15} className="text-sky-400" />
          <span className="font-semibold text-slate-200">Consola Terminal Interactiva</span>
          <span className="text-slate-600">·</span>
          {/* Node Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
            <span className="text-slate-400">Equipo:</span>
            <select
              value={currentNode.id}
              onChange={(e) => onSelectNode(e.target.value)}
              className="bg-transparent text-sky-400 font-semibold focus:outline-none cursor-pointer"
            >
              {allNodes
                .filter((n) => n.type === 'pc' || n.type === 'mobile' || n.type === 'server' || n.type === 'router' || n.type === 'switch')
                .map((n) => (
                  <option key={n.id} value={n.id} className="bg-slate-900 text-slate-200">
                    {n.type === 'switch' ? `[SW L2/802.1Q] ${n.name}` : n.name} ({n.primaryIp || (n.type === 'switch' ? 'Puertos 802.1Q' : n.type)}) - {n.label}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://www.unfantasmaenelsistema.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700/50 transition-colors"
            title="Visitar unfantasmaenelsistema.com"
          >
            <img
              src="/assets/aistudio/icono_81a3db5b.png"
              alt="Logo"
              className="w-3.5 h-3.5 aspect-square object-contain shrink-0"
            />
            <span className="text-[11px] font-sans">unfantasmaenelsistema.com</span>
          </a>
          <button
            onClick={() => onExecuteCommand('help', currentNode)}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
            title="Ver ayuda de comandos"
          >
            <HelpCircle size={13} />
            <span>Ayuda</span>
          </button>
          <button
            onClick={onClearHistory}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
            title="Limpiar pantalla"
          >
            <Trash2 size={13} />
            <span>Limpiar</span>
          </button>
        </div>
      </div>

      {/* Quick Command Suggestions */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/60 border-b border-slate-800/80 overflow-x-auto whitespace-nowrap scrollbar-thin">
        <span className="text-slate-500 flex items-center gap-1 shrink-0">
          <Sparkles size={12} className="text-sky-400" /> Atajos:
        </span>
        {quickCommands.map((q) => (
          <button
            key={q.cmd}
            onClick={() => {
              setInputVal(q.cmd);
              onExecuteCommand(q.cmd, currentNode);
            }}
            className="px-2 py-0.5 bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700/50 text-[11px] transition-colors shrink-0"
          >
            {q.cmd}
          </button>
        ))}
      </div>

      {/* Terminal Output Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-1.5 selection:bg-sky-500/30 selection:text-white">
        <div className="text-slate-500 pb-2 border-b border-slate-800/50">
          Academia NetShell v2.4 (Simulación L2/L3 en tiempo real)
          <br />
          Escribe <span className="text-sky-400">help</span> para consultar la lista de comandos disponibles.
        </div>

        {historyLogs.map((log) => {
          let colorClass = 'text-slate-300';
          if (log.type === 'cmd') colorClass = 'text-sky-400 font-bold';
          if (log.type === 'error') colorClass = 'text-rose-400 font-medium';
          if (log.type === 'success') colorClass = 'text-emerald-400 font-medium';
          if (log.type === 'info') colorClass = 'text-amber-300';

          return (
            <div key={log.id} className={`whitespace-pre-wrap leading-relaxed ${colorClass}`}>
              {log.text}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Terminal Input Row */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/90 border-t border-slate-800">
        <div className="flex items-center text-slate-400 shrink-0 font-semibold">
          <span className="text-emerald-400">{getPromptUser()}</span>
          <span className="text-slate-500">@</span>
          <span className="text-sky-400">{currentNode.name}</span>
          <span className="text-slate-500">:</span>
          <span className="text-slate-300">~</span>
          <span className="text-slate-500 ml-1">$</span>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un comando (ej: ping 192.168.20.11, curl campus.academia.edu)..."
          className="flex-1 bg-transparent text-slate-100 placeholder-slate-600 focus:outline-none text-xs"
        />
        <button
          type="submit"
          disabled={!inputVal.trim()}
          className="p-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-30 disabled:hover:bg-sky-600 text-white rounded transition-colors"
          title="Ejecutar"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
};
