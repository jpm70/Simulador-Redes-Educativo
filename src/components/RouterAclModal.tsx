import React, { useState } from 'react';
import {
  X,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  Check,
  Copy,
  RotateCcw,
  FileCode,
  Sliders,
  HelpCircle,
  Router,
  Terminal,
  Play,
  Layers,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { NetworkNode, NetworkLink, FirewallRule, ProtocolType } from '../types/network';
import {
  AclContext,
  evaluateRouterAcl,
  findPhysicalPath,
  isValidCidrOrAny,
  isValidPortSpec,
  portTowards,
} from '../services/networkEngine';
import { INITIAL_NODES } from '../data/topologyData';

interface RouterAclModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: NetworkNode[];
  links?: NetworkLink[];
  selectedRouterId?: string;
  onUpdateRouterRules: (routerId: string, rules: FirewallRule[]) => void;
}

// Educational preset templates
const ACL_PRESETS: {
  title: string;
  description: string;
  routerId: 'r-academico' | 'r-admin';
  rules: FirewallRule[];
}[] = [
  {
    title: 'Aislamiento Estricto WiFi Invitados',
    description: 'Bloquea todo tráfico de invitados hacia Aulas y Red Administrativa, permitiendo solo navegación WAN.',
    routerId: 'r-academico',
    rules: [
      {
        id: 'preset-wifi-iso-aulas',
        sequence: 10,
        aclNumber: 101,
        description: 'Bloquear acceso de Invitados a Subred Aulas 1-3',
        sourceSubnet: '172.16.50.0/24',
        destSubnet: '192.168.0.0/16',
        protocol: 'ANY',
        action: 'DROP',
        enabled: true,
        interfaceName: 'eth4',
        direction: 'IN',
      },
      {
        id: 'preset-wifi-iso-admin',
        sequence: 20,
        aclNumber: 101,
        description: 'Bloquear acceso de Invitados a Red de Administración',
        sourceSubnet: '172.16.50.0/24',
        destSubnet: '192.168.100.0/24',
        protocol: 'ANY',
        action: 'DROP',
        enabled: true,
        interfaceName: 'eth4',
        direction: 'IN',
      },
      {
        id: 'preset-wifi-allow-dns',
        sequence: 30,
        aclNumber: 101,
        description: 'Permitir consultas DNS externas para Invitados',
        sourceSubnet: '172.16.50.0/24',
        destSubnet: 'any',
        protocol: 'UDP',
        destPort: '53',
        action: 'ALLOW',
        enabled: true,
        interfaceName: 'eth4',
        direction: 'IN',
      },
      {
        id: 'preset-wifi-allow-web',
        sequence: 40,
        aclNumber: 101,
        description: 'Permitir navegación Web HTTP/HTTPS hacia Internet',
        sourceSubnet: '172.16.50.0/24',
        destSubnet: 'any',
        protocol: 'TCP',
        destPort: '80,443',
        action: 'ALLOW',
        enabled: true,
        interfaceName: 'eth4',
        direction: 'IN',
      },
      {
        id: 'preset-wifi-deny-all',
        sequence: 50,
        aclNumber: 101,
        description: 'Deny explícito para el resto de tráfico de Invitados',
        sourceSubnet: '172.16.50.0/24',
        destSubnet: 'any',
        protocol: 'ANY',
        action: 'DROP',
        enabled: true,
        interfaceName: 'eth4',
        direction: 'IN',
      },
    ],
  },
  {
    title: 'Protección Servidor BD Secretaría',
    description: 'Bloquea puertos de Base de Datos (1521/3306) desde subredes docentes/alumnos, permitiendo únicamente al equipo de Dirección.',
    routerId: 'r-admin',
    rules: [
      {
        id: 'preset-db-allow-direccion',
        sequence: 10,
        aclNumber: 102,
        description: 'Permitir acceso a DB Secretaría exclusivamente desde PC Dirección',
        sourceSubnet: '192.168.100.10/32',
        destSubnet: '192.168.100.20/32',
        protocol: 'TCP',
        destPort: '1521',
        action: 'ALLOW',
        enabled: true,
        interfaceName: 'eth1',
        direction: 'IN',
      },
      {
        id: 'preset-db-deny-aulas',
        sequence: 20,
        aclNumber: 102,
        description: 'Bloquear acceso a DB Secretaría desde Aulas Académicas (192.168.0.0/16)',
        sourceSubnet: '192.168.0.0/16',
        destSubnet: '192.168.100.20/32',
        protocol: 'TCP',
        destPort: '1521',
        action: 'DROP',
        enabled: true,
        interfaceName: 'eth0',
        direction: 'IN',
      },
      {
        id: 'preset-db-allow-web',
        sequence: 30,
        aclNumber: 102,
        description: 'Permitir tráfico Web HTTP/HTTPS a servidores de administración',
        sourceSubnet: 'any',
        destSubnet: '192.168.100.0/24',
        protocol: 'TCP',
        destPort: '80,443',
        action: 'ALLOW',
        enabled: true,
        interfaceName: 'any',
        direction: 'IN',
      },
    ],
  },
  {
    title: 'Bloqueo ICMP (Anti-Ping Diagnóstico)',
    description: 'Bloquea los paquetes ICMP Echo Request entre Aulas para simular cortafuegos silencioso.',
    routerId: 'r-academico',
    rules: [
      {
        id: 'preset-deny-icmp-aulas',
        sequence: 10,
        aclNumber: 101,
        description: 'Bloquear ICMP Echo Request (Ping) entre Aula 1 y Aula 2',
        sourceSubnet: '192.168.10.0/24',
        destSubnet: '192.168.20.0/24',
        protocol: 'ICMP',
        action: 'DROP',
        enabled: true,
        interfaceName: 'eth1',
        direction: 'IN',
      },
      {
        id: 'preset-allow-other-icmp',
        sequence: 20,
        aclNumber: 101,
        description: 'Permitir el resto de tráfico ICMP en la academia',
        sourceSubnet: 'any',
        destSubnet: 'any',
        protocol: 'ICMP',
        action: 'ALLOW',
        enabled: true,
        interfaceName: 'any',
        direction: 'IN',
      },
    ],
  },
];

export const RouterAclModal: React.FC<RouterAclModalProps> = ({
  isOpen,
  onClose,
  nodes,
  links = [],
  selectedRouterId = 'r-academico',
  onUpdateRouterRules,
}) => {
  const routerNodes = nodes.filter((n) => n.type === 'router');
  const [currentRouterId, setCurrentRouterId] = useState<string>(selectedRouterId);

  // Synchronize when prop changes
  React.useEffect(() => {
    if (selectedRouterId && routerNodes.some((r) => r.id === selectedRouterId)) {
      setCurrentRouterId(selectedRouterId);
    }
  }, [selectedRouterId]);

  const currentRouter = routerNodes.find((r) => r.id === currentRouterId) || routerNodes[0];
  const rules = currentRouter?.firewallRules || [];

  // Form states
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [showTester, setShowTester] = useState<boolean>(false);
  const [showCliView, setShowCliView] = useState<boolean>(false);
  const [copiedCli, setCopiedCli] = useState<boolean>(false);

  // Form fields
  const [formSequence, setFormSequence] = useState<number>(10);
  const [formDescription, setFormDescription] = useState<string>('');
  const [formAction, setFormAction] = useState<'ALLOW' | 'DROP'>('DROP');
  const [formProtocol, setFormProtocol] = useState<ProtocolType | 'ANY'>('ANY');
  const [formSourceSubnet, setFormSourceSubnet] = useState<string>('any');
  const [formSourcePort, setFormSourcePort] = useState<string>('any');
  const [formDestSubnet, setFormDestSubnet] = useState<string>('any');
  const [formDestPort, setFormDestPort] = useState<string>('any');
  const [formInterface, setFormInterface] = useState<string>('any');
  const [formDirection, setFormDirection] = useState<'IN' | 'OUT'>('IN');
  const [formError, setFormError] = useState<string | null>(null);

  // Tester state
  const [testSrcNodeId, setTestSrcNodeId] = useState<string>('laptop-guest');
  const [testDstNodeId, setTestDstNodeId] = useState<string>('srv-gestion');
  const [testProtocol, setTestProtocol] = useState<ProtocolType | 'ANY'>('TCP');
  const [testDestPort, setTestDestPort] = useState<number>(1521);
  const [testResult, setTestResult] = useState<{
    evaluated: boolean;
    allowed: boolean;
    matchedRule?: FirewallRule;
    explanation: string;
  } | null>(null);

  if (!isOpen || !currentRouter) return null;

  // Open Add Rule Form
  const handleOpenAddForm = () => {
    const nextSeq = rules.length > 0 ? Math.max(...rules.map((r) => r.sequence || 10)) + 10 : 10;
    setEditingRuleId(null);
    setFormSequence(nextSeq);
    setFormDescription('Regla de control de tráfico');
    setFormAction('DROP');
    setFormProtocol('ANY');
    setFormSourceSubnet('any');
    setFormSourcePort('any');
    setFormDestSubnet('any');
    setFormDestPort('any');
    setFormInterface('any');
    setFormDirection('IN');
    setFormError(null);
    setIsEditing(true);
  };

  // Open Edit Form with existing rule
  const handleOpenEditForm = (rule: FirewallRule) => {
    setEditingRuleId(rule.id);
    setFormSequence(rule.sequence || 10);
    setFormDescription(rule.description);
    setFormAction(rule.action);
    setFormProtocol(rule.protocol);
    setFormSourceSubnet(rule.sourceSubnet);
    setFormSourcePort(rule.sourcePort || 'any');
    setFormDestSubnet(rule.destSubnet);
    setFormDestPort(rule.destPort || 'any');
    setFormInterface(rule.interfaceName || 'any');
    setFormDirection(rule.direction || 'IN');
    setFormError(null);
    setIsEditing(true);
  };

  // Save Rule (Add or Edit)
  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();

    const seqNum = Number(formSequence);
    const problems: string[] = [];
    if (!Number.isInteger(seqNum) || seqNum < 1 || seqNum > 9999) problems.push('el número de secuencia debe ser un entero entre 1 y 9999');
    else if (rules.some((r) => r.sequence === seqNum && r.id !== editingRuleId)) problems.push(`ya existe una regla con la secuencia ${seqNum}`);
    if (!isValidCidrOrAny(formSourceSubnet)) problems.push('la red de origen debe ser "any", una IP o IP/prefijo (ej. 192.168.10.0/24)');
    if (!isValidCidrOrAny(formDestSubnet)) problems.push('la red de destino debe ser "any", una IP o IP/prefijo (ej. 192.168.100.20/32)');
    if (!isValidPortSpec(formSourcePort)) problems.push('el puerto de origen debe ser "any", un puerto o lista/rango (ej. 1024-65535)');
    if (!isValidPortSpec(formDestPort)) problems.push('el puerto de destino debe ser "any", un puerto o lista/rango (ej. 80,443)');
    if (problems.length) {
      setFormError(`Revisa la regla: ${problems.join('; ')}.`);
      return;
    }
    setFormError(null);

    const ruleData: FirewallRule = {
      id: editingRuleId || `acl-${currentRouter.id}-${Date.now()}`,
      sequence: Number(formSequence),
      aclNumber: currentRouter.id === 'r-academico' ? 101 : 102,
      description: formDescription.trim() || 'Regla de filtrado de tráfico',
      action: formAction,
      protocol: formProtocol,
      sourceSubnet: formSourceSubnet.trim() || 'any',
      sourcePort: formSourcePort.trim() || 'any',
      destSubnet: formDestSubnet.trim() || 'any',
      destPort: formDestPort.trim() || 'any',
      interfaceName: formInterface,
      direction: formDirection,
      enabled: true,
    };

    let updatedRules: FirewallRule[];
    if (editingRuleId) {
      updatedRules = rules.map((r) => (r.id === editingRuleId ? ruleData : r));
    } else {
      updatedRules = [...rules, ruleData];
    }

    // Sort by sequence number
    updatedRules.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

    onUpdateRouterRules(currentRouter.id, updatedRules);
    setIsEditing(false);
    setEditingRuleId(null);
  };

  // Toggle rule enable/disable
  const handleToggleRule = (ruleId: string) => {
    const updated = rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r));
    onUpdateRouterRules(currentRouter.id, updated);
  };

  // Delete rule
  const handleDeleteRule = (ruleId: string) => {
    const updated = rules.filter((r) => r.id !== ruleId);
    onUpdateRouterRules(currentRouter.id, updated);
  };

  // Move rule up (higher priority)
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const newRules = [...rules];
    const temp = newRules[index];
    newRules[index] = newRules[index - 1];
    newRules[index - 1] = temp;

    // Re-index sequences
    const reindexed = newRules.map((r, idx) => ({ ...r, sequence: (idx + 1) * 10 }));
    onUpdateRouterRules(currentRouter.id, reindexed);
  };

  // Move rule down (lower priority)
  const handleMoveDown = (index: number) => {
    if (index >= rules.length - 1) return;
    const newRules = [...rules];
    const temp = newRules[index];
    newRules[index] = newRules[index + 1];
    newRules[index + 1] = temp;

    // Re-index sequences
    const reindexed = newRules.map((r, idx) => ({ ...r, sequence: (idx + 1) * 10 }));
    onUpdateRouterRules(currentRouter.id, reindexed);
  };

  // Apply a preset
  const handleApplyPreset = (preset: typeof ACL_PRESETS[0]) => {
    onUpdateRouterRules(currentRouter.id, preset.rules);
  };

  // Reset to default
  const handleResetDefaults = () => {
    // Single source of truth: the rules shipped with the initial topology
    const initial = INITIAL_NODES.find((n) => n.id === currentRouter.id);
    onUpdateRouterRules(currentRouter.id, (initial?.firewallRules || []).map((r) => ({ ...r })));
  };

  // Convert CIDR to Cisco Wildcard mask format for CLI preview
  const cidrToWildcard = (cidr: string): string => {
    if (!cidr || cidr.toLowerCase() === 'any') return 'any';
    if (!cidr.includes('/')) return `host ${cidr}`;
    const [ip, prefixStr] = cidr.split('/');
    const prefix = parseInt(prefixStr, 10);
    if (prefix === 32) return `host ${ip}`;
    if (prefix === 0) return 'any';

    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    const wildcard = ~mask >>> 0;
    const w1 = (wildcard >>> 24) & 255;
    const w2 = (wildcard >>> 16) & 255;
    const w3 = (wildcard >>> 8) & 255;
    const w4 = wildcard & 255;
    return `${ip} ${w1}.${w2}.${w3}.${w4}`;
  };

  // Generate Cisco IOS CLI script: one named ACL per interface/direction set of rules
  const generateCiscoCli = (): string => {
    const aclBase = currentRouter.id === 'r-academico' ? 101 : 102;
    const routerTag = currentRouter.id.toUpperCase().replace(/-/g, '_');
    const active = [...rules]
      .filter((r) => r.enabled)
      .sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999));

    const iosProto = (r: FirewallRule) => {
      const p = (r.protocol || 'ANY').toUpperCase();
      if (['TCP', 'HTTP', 'HTTPS', 'SSH'].includes(p)) return 'tcp';
      if (['UDP', 'DNS', 'DHCP'].includes(p)) return 'udp';
      if (p === 'ICMP') return 'icmp';
      return 'ip';
    };
    const impliedPorts: Record<string, string> = { HTTP: '80,443', HTTPS: '443', DNS: '53', SSH: '22' };

    // A port spec may need several IOS lines (eq a b c / range x y)
    const portVariants = (spec: string | undefined): string[] => {
      if (!spec || spec === 'any') return [''];
      const parts = spec.split(',').map((p) => p.trim()).filter(Boolean);
      const singles = parts.filter((p) => !p.includes('-'));
      const ranges = parts.filter((p) => p.includes('-'));
      return [
        ...(singles.length ? [` eq ${singles.join(' ')}`] : []),
        ...ranges.map((r) => ` range ${r.replace('-', ' ')}`),
      ];
    };

    const ruleLines = (r: FirewallRule): string[] => {
      const proto = iosProto(r);
      const action = r.action === 'ALLOW' ? 'permit' : 'deny';
      const src = cidrToWildcard(r.sourceSubnet);
      const dst = cidrToWildcard(r.destSubnet);
      const usesPorts = proto === 'tcp' || proto === 'udp';
      const dstSpec = r.destPort && r.destPort !== 'any' ? r.destPort : impliedPorts[(r.protocol || '').toUpperCase()];
      const srcVariants = usesPorts ? portVariants(r.sourcePort) : [''];
      const dstVariants = usesPorts ? portVariants(dstSpec) : [''];
      const lines: string[] = [];
      let seq = r.sequence ?? 10;
      for (const sp of srcVariants) {
        for (const dp of dstVariants) {
          lines.push(`  ${seq} ${action} ${proto} ${src}${sp} ${dst}${dp}`);
          seq += 1;
        }
      }
      return lines;
    };

    const header = [
      `! ========================================================`,
      `! Configuración Cisco IOS - Access Control Lists (ACL)`,
      `! Router: ${currentRouter.name} (${currentRouter.hostname})`,
      `! Generado por: Simulador de Redes Educativo`,
      `! Web Oficial: https://www.unfantasmaenelsistema.com/`,
      `! Interfaces con el nombre del simulador (en un equipo real: GigabitEthernet0/x)`,
      `! ========================================================`,
      `enable`,
      `configure terminal`,
    ];

    if (active.length === 0) {
      return [...header, `! No hay reglas activas: no se aplica ninguna ACL.`, `end`].join('\n');
    }

    // Group interface/direction pairs that receive exactly the same rule list
    const groups: { name: string; rules: FirewallRule[]; bindings: string[] }[] = [];
    for (const iface of currentRouter.interfaces) {
      for (const dir of ['IN', 'OUT'] as const) {
        const list = active.filter(
          (r) =>
            (r.direction || 'IN') === dir &&
            ((r.interfaceName || 'any') === 'any' || r.interfaceName === iface.name)
        );
        if (list.length === 0) continue;
        const key = list.map((r) => r.id).join('|');
        const binding = `${iface.name} ${dir.toLowerCase()}`;
        const existing = groups.find((g) => g.rules.map((r) => r.id).join('|') === key);
        if (existing) existing.bindings.push(binding);
        else groups.push({ name: `ACL_${routerTag}_${aclBase}${groups.length ? `_${groups.length + 1}` : ''}`, rules: list, bindings: [binding] });
      }
    }

    const lines = [...header];
    for (const g of groups) {
      const last = Math.max(...g.rules.map((r) => r.sequence ?? 10));
      lines.push(`ip access-list extended ${g.name}`);
      g.rules.forEach((r) => lines.push(`  remark ${r.description.replace(/\s+/g, ' ').slice(0, 90)}`, ...ruleLines(r)));
      lines.push(`  ! Política del simulador: lo que no coincide se PERMITE.`);
      lines.push(`  ! En Cisco IOS toda ACL acaba con un "deny ip any any" implícito;`);
      lines.push(`  ! esta línea reproduce el comportamiento del simulador:`);
      lines.push(`  ${Math.ceil((last + 1) / 10) * 10 + 10} permit ip any any`);
      lines.push(`exit`);
      lines.push(``);
    }

    lines.push(`! Aplicación de las ACL a las interfaces:`);
    for (const g of groups) {
      for (const b of g.bindings) {
        const [ifaceName, dir] = b.split(' ');
        lines.push(`interface ${ifaceName}`);
        lines.push(`  ip access-group ${g.name} ${dir}`);
        lines.push(`exit`);
      }
    }
    lines.push(`end`);
    lines.push(`write memory`);

    return lines.join('\n');
  };

  // Copy CLI text
  const handleCopyCli = () => {
    navigator.clipboard.writeText(generateCiscoCli());
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2000);
  };

  // Run live rule test along the real path between both devices
  const handleRunTester = () => {
    const srcNode = nodes.find((n) => n.id === testSrcNodeId);
    const dstNode = nodes.find((n) => n.id === testDstNodeId);
    if (!srcNode || !dstNode) {
      setTestResult({ evaluated: true, allowed: true, explanation: 'Selecciona un equipo de origen y otro de destino.' });
      return;
    }

    const srcIp = srcNode.primaryIp || '';
    const dstIp = dstNode.primaryIp || '';
    let ctx: AclContext | undefined;
    const path = links.length ? findPhysicalPath(srcNode.id, dstNode.id, links) : null;
    if (path) {
      const idx = path.indexOf(currentRouter.id);
      if (idx === -1) {
        const names = path.map((id) => nodes.find((n) => n.id === id)?.name || id).join(' → ');
        setTestResult({
          evaluated: true,
          allowed: true,
          explanation: `${currentRouter.name} no está en el camino (${names}): sus ACL no afectan a este tráfico.`,
        });
        return;
      }
      ctx = {
        ingress: idx > 0 ? portTowards(links, currentRouter.id, path[idx - 1]) : undefined,
        egress: idx < path.length - 1 ? portTowards(links, currentRouter.id, path[idx + 1]) : undefined,
      };
    }

    const res = evaluateRouterAcl({ ...currentRouter, firewallRules: rules }, srcIp, dstIp, testProtocol, testDestPort, 0, ctx);
    const where = ctx ? ` El paquete entra por ${ctx.ingress ?? '—'} y sale por ${ctx.egress ?? '—'}.` : '';

    if (!res.isAllowed && res.matchedRule) {
      setTestResult({
        evaluated: true,
        allowed: false,
        matchedRule: res.matchedRule,
        explanation: `Coincidencia con Regla #${res.matchedRule.sequence} ("${res.matchedRule.description}") en la lista de ${res.direction === 'OUT' ? 'salida' : 'entrada'}. Acción: DENEGAR (DROP). El router bloquea y descarta el paquete.${where}`,
      });
    } else if (res.matchedRule) {
      setTestResult({
        evaluated: true,
        allowed: true,
        matchedRule: res.matchedRule,
        explanation: `Coincidencia con Regla #${res.matchedRule.sequence} ("${res.matchedRule.description}"). Acción: PERMITIR (ALLOW). El paquete supera este router.${where}`,
      });
    } else {
      setTestResult({
        evaluated: true,
        allowed: true,
        explanation: `Ninguna regla aplicable a esas interfaces coincidió.${where} Política del simulador: se permite el paso (en un router Cisco real, el "deny ip any any" implícito lo descartaría).`,
      });
    }
  };

  const activeRulesCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-950/80 border border-rose-800/60 rounded-xl text-rose-400">
              <ShieldAlert size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Editor de Listas de Control de Acceso (ACLs) L3/L4
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950 text-sky-400 border border-sky-800">
                  Cisco IOS Extended ACL (100-199)
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Filtra y securiza paquetes IP basándote en subredes, puertos y protocolos en los Routers del Campus
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

        {/* Router Selector Tabs & Quick Stats Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-slate-800 bg-slate-950/60 text-xs">
          {/* Router Selectors */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Router Activo:</span>
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
              {routerNodes.map((router) => {
                const isSelected = router.id === currentRouterId;
                const ruleCount = router.firewallRules?.length || 0;
                return (
                  <button
                    key={router.id}
                    onClick={() => {
                      setCurrentRouterId(router.id);
                      setIsEditing(false);
                      setTestResult(null);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                      isSelected
                        ? 'bg-sky-600 text-white shadow'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Router size={14} />
                    <span>{router.name}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] ${
                        isSelected ? 'bg-sky-800 text-sky-200' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {ruleCount} reglas
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Router Quick Info */}
          <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
            <div>
              <span className="text-slate-500 font-sans">IP Core:</span>{' '}
              <span className="text-sky-300 font-semibold">{currentRouter.primaryIp}</span>
            </div>
            <div>
              <span className="text-slate-500 font-sans">Activas:</span>{' '}
              <span className="text-emerald-400 font-semibold">{activeRulesCount}</span> / {rules.length}
            </div>
            <div className="hidden sm:block">
              <span className="text-slate-500 font-sans">Evaluación:</span>{' '}
              <span className="text-amber-400 font-semibold">First-Match Top-Down</span>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-2.5 border-b border-slate-800 bg-slate-900/40 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenAddForm}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors shadow-sm"
            >
              <Plus size={14} />
              <span>Añadir Regla ACL</span>
            </button>

            {/* Educational Preset dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition-colors">
                <Sliders size={13} className="text-sky-400" />
                <span>Cargar Plantillas Didácticas</span>
              </button>
              <div className="absolute left-0 top-full mt-1 w-72 bg-slate-900 border border-slate-700 rounded-xl p-2 shadow-2xl z-20 hidden group-hover:block divide-y divide-slate-800">
                <div className="px-2 py-1 text-[11px] font-bold text-slate-400">Escenarios de Seguridad CCNA:</div>
                {ACL_PRESETS.filter((p) => p.routerId === currentRouterId).map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleApplyPreset(preset)}
                    className="w-full text-left p-2 hover:bg-slate-800 rounded-lg transition-colors group/item"
                  >
                    <div className="font-semibold text-slate-200 group-hover/item:text-sky-400 text-xs">
                      {preset.title}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{preset.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowTester(!showTester)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                showTester
                  ? 'bg-purple-950 text-purple-300 border-purple-700'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <Play size={13} className="text-purple-400" />
              <span>{showTester ? 'Ocultar Probador' : 'Probar Coincidencia'}</span>
            </button>

            <button
              onClick={() => setShowCliView(!showCliView)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                showCliView
                  ? 'bg-amber-950 text-amber-300 border-amber-700'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <FileCode size={13} className="text-amber-400" />
              <span>{showCliView ? 'Ocultar Cisco CLI' : 'Ver Cisco IOS CLI'}</span>
            </button>
          </div>

          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-200 text-xs transition-colors"
            title="Restablecer reglas ACL originales para este router"
          >
            <RotateCcw size={12} />
            <span>Restablecer por Defecto</span>
          </button>
        </div>

        {/* Main Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Section A: Live Match Tester Sandbox */}
          {showTester && (
            <div className="p-4 rounded-xl border border-purple-800/50 bg-purple-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play size={16} className="text-purple-400" />
                  <h3 className="text-xs font-bold text-purple-200 uppercase tracking-wider">
                    Simulador Interactivo de Coincidencia de Reglas (ACL Engine)
                  </h3>
                </div>
                <span className="text-[11px] text-purple-300">Prueba en tiempo real si un paquete supera la ACL</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Equipo Origen:</label>
                  <select
                    value={testSrcNodeId}
                    onChange={(e) => setTestSrcNodeId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-purple-500 font-mono"
                  >
                    {nodes
                      .filter((n) => n.type !== 'switch' && n.type !== 'router')
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name} ({n.primaryIp})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Equipo Destino:</label>
                  <select
                    value={testDstNodeId}
                    onChange={(e) => setTestDstNodeId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-purple-500 font-mono"
                  >
                    {nodes
                      .filter((n) => n.type !== 'switch' && n.type !== 'router')
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name} ({n.primaryIp})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Protocolo L4:</label>
                  <select
                    value={testProtocol}
                    onChange={(e) => setTestProtocol(e.target.value as ProtocolType | 'ANY')}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                  >
                    <option value="TCP">TCP</option>
                    <option value="UDP">UDP</option>
                    <option value="ICMP">ICMP (Ping)</option>
                    <option value="HTTP">HTTP (Web 80)</option>
                    <option value="DNS">DNS (Puerto 53)</option>
                    <option value="ANY">Cualquiera (ANY)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Puerto Destino:</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={testDestPort}
                      onChange={(e) => setTestDestPort(Number(e.target.value))}
                      placeholder="80, 443, 1521..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-purple-500 font-mono"
                    />
                    <button
                      onClick={handleRunTester}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition-colors whitespace-nowrap"
                    >
                      Evaluar
                    </button>
                  </div>
                </div>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-lg border flex items-center justify-between text-xs animate-in fade-in ${
                    testResult.allowed
                      ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-700/60 text-rose-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {testResult.allowed ? (
                      <ShieldCheck size={20} className="text-emerald-400 shrink-0" />
                    ) : (
                      <ShieldAlert size={20} className="text-rose-400 shrink-0" />
                    )}
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        <span>{testResult.allowed ? 'TRÁFICO PERMITIDO (ALLOW)' : 'TRÁFICO DENEGADO (DROP)'}</span>
                        {testResult.matchedRule && (
                          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-black/40 border border-current">
                            Sec {testResult.matchedRule.sequence}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] opacity-90 mt-0.5">{testResult.explanation}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section B: Cisco IOS CLI Script Preview */}
          {showCliView && (
            <div className="p-4 rounded-xl border border-amber-800/50 bg-amber-950/20 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between font-sans">
                <div className="flex items-center gap-2">
                  <Terminal size={16} className="text-amber-400" />
                  <span className="text-xs font-bold text-amber-200">
                    Sintaxis Equivalente Cisco IOS (Router CLI)
                  </span>
                </div>
                <button
                  onClick={handleCopyCli}
                  className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  {copiedCli ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedCli ? '¡Copiado!' : 'Copiar CLI'}</span>
                </button>
              </div>

              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-amber-300 overflow-x-auto whitespace-pre font-mono leading-relaxed">
                {generateCiscoCli()}
              </pre>
            </div>
          )}

          {/* Section C: Add / Edit Rule Form */}
          {isEditing && (
            <form
              onSubmit={handleSaveRule}
              className="p-5 rounded-xl border border-sky-800/60 bg-sky-950/10 space-y-4 text-xs animate-in fade-in"
            >
              <div className="flex items-center justify-between border-b border-sky-800/40 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders size={16} className="text-sky-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    {editingRuleId ? 'Editar Regla ACL Existente' : 'Nueva Regla de Control de Acceso (ACL)'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Sequence */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Número de Secuencia (Cisco Seq):
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="9999"
                    value={formSequence}
                    onChange={(e) => setFormSequence(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Determina la prioridad: se evalúan de menor a mayor.
                  </p>
                </div>

                {/* Action */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Acción del Router:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormAction('DROP')}
                      className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 border transition-all ${
                        formAction === 'DROP'
                          ? 'bg-rose-600 border-rose-500 text-white shadow'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-rose-300'
                      }`}
                    >
                      <ShieldAlert size={14} />
                      <span>DENEGAR (DROP)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormAction('ALLOW')}
                      className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 border transition-all ${
                        formAction === 'ALLOW'
                          ? 'bg-emerald-600 border-emerald-500 text-white shadow'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-emerald-300'
                      }`}
                    >
                      <ShieldCheck size={14} />
                      <span>PERMITIR (ALLOW)</span>
                    </button>
                  </div>
                </div>

                {/* Protocol */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Protocolo L3 / L4:</label>
                  <select
                    value={formProtocol}
                    onChange={(e) => setFormProtocol(e.target.value as ProtocolType | 'ANY')}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                  >
                    <option value="ANY">ANY (Todos los protocolos IP)</option>
                    <option value="TCP">TCP (Transmission Control Protocol)</option>
                    <option value="UDP">UDP (User Datagram Protocol)</option>
                    <option value="ICMP">ICMP (Ping & Diagnóstico)</option>
                    <option value="HTTP">HTTP (Navegación Web Puerto 80)</option>
                    <option value="DNS">DNS (Resolución de Nombres Puerto 53)</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Descripción / Propósito Didáctico:</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Ej: Aislamiento WiFi: Bloquear acceso a subred de servidores..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              {/* Source & Destination Matrix */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
                {/* Source */}
                <div className="space-y-2">
                  <div className="font-bold text-sky-400 flex items-center gap-1.5 text-xs">
                    <span>Origen (Source IP & Port)</span>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-0.5">IP o Subred CIDR:</label>
                    <input
                      type="text"
                      value={formSourceSubnet}
                      onChange={(e) => setFormSourceSubnet(e.target.value)}
                      placeholder="172.16.50.0/24, 192.168.10.15 o 'any'"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500"
                      required
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] text-slate-500">Presets rápidos:</span>
                    <button
                      type="button"
                      onClick={() => setFormSourceSubnet('172.16.50.0/24')}
                      className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-sky-300"
                    >
                      WiFi Invitados
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormSourceSubnet('192.168.10.0/24')}
                      className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-sky-300"
                    >
                      Aula 1
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormSourceSubnet('192.168.0.0/16')}
                      className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-sky-300"
                    >
                      Todas las Aulas
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormSourceSubnet('any')}
                      className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-sky-300"
                    >
                      any
                    </button>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-0.5">Puerto Origen:</label>
                    <input
                      type="text"
                      value={formSourcePort}
                      onChange={(e) => setFormSourcePort(e.target.value)}
                      placeholder="any o número"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {/* Destination */}
                <div className="space-y-2">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5 text-xs">
                    <span>Destino (Destination IP & Port)</span>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-0.5">IP o Subred CIDR:</label>
                    <input
                      type="text"
                      value={formDestSubnet}
                      onChange={(e) => setFormDestSubnet(e.target.value)}
                      placeholder="192.168.100.20/32, 192.168.100.0/24 o 'any'"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] text-slate-500">Presets rápidos:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFormDestSubnet('192.168.100.20/32');
                        setFormDestPort('1521');
                      }}
                      className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-emerald-300"
                    >
                      DB Secretaría
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormDestSubnet('192.168.200.50/32');
                        setFormDestPort('80,443');
                      }}
                      className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-emerald-300"
                    >
                      Web Moodle
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormDestSubnet('192.168.100.0/24')}
                      className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-emerald-300"
                    >
                      Admin Zone
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormDestSubnet('any')}
                      className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-emerald-300"
                    >
                      any
                    </button>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-0.5">Puerto Destino:</label>
                    <input
                      type="text"
                      value={formDestPort}
                      onChange={(e) => setFormDestPort(e.target.value)}
                      placeholder="any, 80, 443, 53, 1521..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Interface & Direction */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Interfaz del Router:</label>
                  <select
                    value={formInterface}
                    onChange={(e) => setFormInterface(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                  >
                    <option value="any">Cualquier Interfaz (Global)</option>
                    {currentRouter.interfaces.map((iface) => (
                      <option key={iface.name} value={iface.name}>
                        {iface.name} ({iface.ip || 'No IP'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Dirección del Flujo:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormDirection('IN')}
                      className={`py-2 px-3 rounded-lg font-bold border transition-colors ${
                        formDirection === 'IN'
                          ? 'bg-sky-600 border-sky-500 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      IN (Entrante)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormDirection('OUT')}
                      className={`py-2 px-3 rounded-lg font-bold border transition-colors ${
                        formDirection === 'OUT'
                          ? 'bg-sky-600 border-sky-500 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      OUT (Saliente)
                    </button>
                  </div>
                </div>
              </div>

              {formError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-colors shadow"
                >
                  {editingRuleId ? 'Actualizar Regla' : 'Guardar y Aplicar Regla'}
                </button>
              </div>
            </form>
          )}

          {/* Section D: Active Rules Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 text-xs">
                Lista de Reglas de Control de Acceso Configurada ({rules.length} reglas):
              </span>
              <span className="text-slate-500 text-[11px]">
                Prioridad: Primera coincidencia (First Match) de arriba hacia abajo
              </span>
            </div>

            {rules.length === 0 ? (
              <div className="p-8 text-center border border-slate-800 rounded-xl bg-slate-950/50 space-y-3">
                <Shield size={32} className="mx-auto text-slate-600" />
                <div className="text-slate-400 text-xs font-semibold">No hay reglas ACL activas en este router.</div>
                <p className="text-slate-500 text-[11px] max-w-md mx-auto">
                  Todo el tráfico inter-redes se encuentra permitido por defecto. Haz clic en &quot;Añadir Regla ACL&quot; o
                  selecciona una plantilla para comenzar a restringir tráfico por IP, puerto o protocolo.
                </p>
                <button
                  onClick={handleOpenAddForm}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg text-xs"
                >
                  Crear Primera Regla
                </button>
              </div>
            ) : (
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 divide-y divide-slate-800">
                {rules.map((rule, index) => {
                  const isDrop = rule.action === 'DROP';
                  return (
                    <div
                      key={rule.id}
                      className={`p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${
                        rule.enabled
                          ? isDrop
                            ? 'bg-rose-950/15 hover:bg-rose-950/25'
                            : 'bg-emerald-950/15 hover:bg-emerald-950/25'
                          : 'bg-slate-950/50 opacity-50'
                      }`}
                    >
                      {/* Left: Priority arrows, Seq, Action badge, and Description */}
                      <div className="flex items-center gap-3">
                        {/* Order controls */}
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                            title="Subir prioridad (evaluar antes)"
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            onClick={() => handleMoveDown(index)}
                            disabled={index === rules.length - 1}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                            title="Bajar prioridad (evaluar después)"
                          >
                            <ArrowDown size={12} />
                          </button>
                        </div>

                        {/* Sequence */}
                        <span className="font-mono text-xs font-bold text-slate-400 w-8 shrink-0">
                          #{rule.sequence || (index + 1) * 10}
                        </span>

                        {/* Action Badge */}
                        <span
                          className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider shrink-0 flex items-center gap-1 ${
                            isDrop
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}
                        >
                          {isDrop ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
                          <span>{rule.action}</span>
                        </span>

                        {/* Protocol */}
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                          {rule.protocol}
                        </span>

                        {/* Description & IPs */}
                        <div>
                          <div className="font-semibold text-slate-200 text-xs flex items-center gap-2">
                            <span>{rule.description}</span>
                            {rule.interfaceName && rule.interfaceName !== 'any' && (
                              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-sky-400 border border-slate-700">
                                {rule.interfaceName} {rule.direction || 'IN'}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-mono mt-1">
                            <div>
                              <span className="text-slate-500 font-sans">Origen:</span>{' '}
                              <span className="text-sky-300">{rule.sourceSubnet}</span>
                              {rule.sourcePort && rule.sourcePort !== 'any' && (
                                <span className="text-slate-500">:{rule.sourcePort}</span>
                              )}
                            </div>
                            <span className="text-slate-600">→</span>
                            <div>
                              <span className="text-slate-500 font-sans">Destino:</span>{' '}
                              <span className="text-emerald-300">{rule.destSubnet}</span>
                              {rule.destPort && rule.destPort !== 'any' && (
                                <span className="text-amber-300 font-semibold"> (Puerto {rule.destPort})</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Toggle Switch & Actions */}
                      <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                        <button
                          onClick={() => handleToggleRule(rule.id)}
                          className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                            rule.enabled
                              ? 'bg-slate-800 text-emerald-400 border border-emerald-800/80'
                              : 'bg-slate-900 text-slate-500 border border-slate-800'
                          }`}
                        >
                          {rule.enabled ? 'ACTIVA' : 'INACTIVA'}
                        </button>

                        <button
                          onClick={() => handleOpenEditForm(rule)}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                          title="Editar regla"
                        >
                          <Edit2 size={13} />
                        </button>

                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Eliminar regla"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Educational Callout */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-3 text-xs text-slate-400 leading-relaxed">
            <HelpCircle size={18} className="text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-200">Concepto Clave de Redes (Cisco CCNA): </span>
              Las Listas de Control de Acceso extendidas inspeccionan las cabeceras de Capa 3 (IPv4) y Capa 4 (TCP/UDP/ICMP).
              Al estar configuradas en los routers de interconexión, permiten filtrar el tráfico antes de ser enrutado
              hacia otras subredes o hacia la salida a Internet WAN, protegiendo servidores clave y garantizando la
              privacidad de los usuarios.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-950 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Motor de Filtrado ACL en Tiempo Real Activo</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors"
          >
            Cerrar Editor
          </button>
        </div>
      </div>
    </div>
  );
};
