<p align="center">
  <a href="https://www.unfantasmaenelsistema.com/" target="_blank" rel="noopener noreferrer">
    <img src="public/assets/aistudio/icono_81a3db5b.png" alt="Un Fantasma en el Sistema" width="130" height="130" style="object-fit: contain;" />
  </a>
</p>

<h1 align="center">Simulador de Red Academia — L2/L3 &amp; IEEE 802.1Q</h1>

<p align="center">
  <strong>Simulador interactivo y educativo de la red de una academia: paquetes animados en tiempo real, terminal de comandos, inspector estilo Wireshark, VLAN 802.1Q, ACL en routers, latencia dinámica y calculadora VLSM.</strong>
</p>

<p align="center">
  <a href="https://unfantasmaenelsistema.github.io/Simulador-Redes-Educativo/"><strong>▶ Abrir el simulador</strong></a>
  ·
  Desarrollado y mantenido por <a href="https://www.unfantasmaenelsistema.com/"><strong>Un Fantasma en el Sistema</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-7-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License MIT" />
</p>

---

## 📸 Vista previa

### 1. Interfaz principal: topología interactiva y consola de comandos
![Vista Previa de la Topología y Consola](docs/images/topology_preview.svg)

### 2. Arquitectura de red y segmentación de subredes
![Arquitectura Lógica de Red y Subredes](docs/images/network_architecture.svg)

---

## 🌟 Características

### 🌐 1. Topología SVG interactiva
- Equipos del campus: routers L3, switches L2 gestionables, servidores (Web/DNS/ERP), PCs, móviles y punto de acceso Wi-Fi.
- **Animación de paquetes**: cada trama viaja de nodo a nodo a una velocidad que depende de la latencia del enlace y con el color de su protocolo.
- **Latencia fluctuante y encolamiento**: cada enlace muestra su retardo (`ms`), que sube cuando la carga de la subred supera el umbral configurado en Telemetría.
- **Cortes de cable**: haz clic en cualquier enlace para desconectarlo (`LINK DOWN`). El troncal entre routers activa el modo *redes independientes* (los routers se quedan sin ruta y responden *Destination Net Unreachable*).

### 💻 2. Consola de terminal
Comandos con historial (↑/↓) y atajos:
- `ping [-c N] [-t TTL] <ip|host>` — ICMP Echo con RTT, TTL real de la respuesta (64 menos un salto por router) y *Time to live exceeded* si el TTL se agota.
- `traceroute <ip|host>` — un salto por router mostrando la IP de la interfaz de entrada; `* * *` donde el tráfico se filtra.
- `arp -a` / `arp -d` — caché ARP; el primer ping a un vecino (o al gateway) dispara el broadcast ARP.
- `ipconfig` / `ifconfig`, `route print` — interfaces, máscaras, gateways y rutas.
- `nslookup <dominio>` — consulta al DNS configurado en cada equipo (SRV-Campus para la red interna, 8.8.8.8 para invitados; un nombre inexistente devuelve `NXDOMAIN`).
- `curl <url>` — resolución DNS + handshake TCP (SYN, SYN-ACK, ACK) + HTTP. Un puerto cerrado responde con RST; un puerto filtrado por ACL acaba en *timeout* (prueba `curl 192.168.100.20:1521` desde un aula).
- `mac-table`, `show vlan`, `vlan set <puerto> <id>` — tabla CAM y VLAN de los puertos de acceso.
- `acl`, `export`, `web`, `clear`, `help`.

### 🦈 3. Inspector de paquetes (estilo Wireshark)
- Captura de todo el tráfico simulado (ICMP, ARP, DNS, TCP, HTTP).
- Disección por capas: Ethernet II con etiqueta **IEEE 802.1Q** (VID, TPID 0x8100, PCP), IPv4 (TTL, protocolo), TCP/UDP (puertos, flags) o ICMP (tipo), y aplicación.
- Botón **"Resaltar camino en la topología"** para ver la ruta completa y dónde se descartó el paquete.

### 🧮 4. Subredes y calculadora VLSM / CIDR
- Mapa de las 6 subredes del campus (VLAN 10, 20, 30, 50, 100 y 200) y del enlace troncal `/30`.
- Calculadora con prefijos `/8` a `/30`: red, máscara, wildcard, rango útil, broadcast, clase y ámbito RFC 1918, con desglose binario de los 32 bits.

### 🚀 5. Inyector de PDU (*Packet Crafter*)
- Envía ICMP, DNS, HTTP o ARP entre dos equipos cualesquiera.
- Ajusta el **TTL** de 1 a 64: con TTL=1 el paquete caduca en el primer router y vuelve un *ICMP Time Exceeded* (tipo 11).

### 📊 6. Telemetría en tiempo real (Recharts)
- Ancho de banda por subred (Aulas, Invitados, Admin) y errores (paquetes descartados).
- Umbrales configurables: al superarlos, las colas aumentan la latencia de los enlaces.

### 🛡️ 7. Editor de ACL en los routers
- Reglas **PERMIT/DENY** por red origen/destino (CIDR), protocolo (`TCP`, `UDP`, `ICMP`, `ANY`…), puertos o rangos, **interfaz y sentido** (IN/OUT).
- **First-match**: las reglas se evalúan de arriba abajo en la lista de la interfaz por la que entra (IN) o sale (OUT) el paquete. Reordena con ▲ ▼.
- **Política por defecto del simulador: permitir.** Si ninguna regla coincide, el tráfico pasa. En Cisco IOS toda ACL termina con un `deny ip any any` implícito; por eso la exportación añade un `permit ip any any` final explícito, para que la configuración se comporte igual que en el simulador.
- Las ACL son *stateless*: también filtran las respuestas (un Echo Reply bloqueado produce *timeout*).
- **Probador de coincidencias**: calcula el camino real entre dos equipos, las interfaces de entrada/salida del router y qué regla se aplica (o te avisa si el router no está en el camino).
- **Exportación a Cisco IOS**: `ip access-list extended`, máscaras wildcard, `eq`/`range` para puertos e `ip access-group` en cada interfaz.
- Plantillas didácticas: aislamiento Wi-Fi de invitados, protección de la BD de secretaría, bloqueo de ping entre aulas…

### 💾 8. Exportación e importación de laboratorios (JSON)
- Guarda nodos, enlaces, VLAN, tablas ARP/CAM y reglas ACL en un `.json` (botón o comando `export`) y vuelve a cargarlo después; el archivo se valida antes de aplicarse.

### 🔊 9. Efectos de audio (Web Audio API)
- Sonidos sintetizados para saltos, entregas, descartes y misiones, sin archivos externos.

---

## 🗺️ Direccionamiento de la red

| Subred / Zona | VLAN | Prefijo CIDR | Gateway | Equipos | Propósito |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Aula 1 (Informática)** | 10 | `192.168.10.0/24` | `192.168.10.1` (R-Academico) | PC-101, PC-102, PC-103 | Prácticas de alumnos |
| **Aula 2 (Diseño)** | 20 | `192.168.20.0/24` | `192.168.20.1` (R-Academico) | PC-201, PC-202, PC-203 | Prácticas de alumnos |
| **Aula 3 (Robótica)** | 30 | `192.168.30.0/24` | `192.168.30.1` (R-Academico) | PC-301, PC-302, PC-303 | Prácticas de alumnos |
| **Wi-Fi Invitados** | 50 | `172.16.50.0/24` | `172.16.50.1` (R-Academico) | Portátil, móvil y tablet | Aislada por ACL, DNS 8.8.8.8 |
| **Dirección y Secretaría** | 100 | `192.168.100.0/24` | `192.168.100.1` (R-Admin) | PC-Direccion, PC-Secretaria, SRV-Gestion | ERP y BD (puerto 1521) |
| **Profesores y Servidores** | 200 | `192.168.200.0/24` | `192.168.200.1` (R-Admin) | PC-Prof-1, PC-Prof-2, SRV-Campus | Web y DNS del campus |
| **Troncal entre routers** | — | `10.0.0.0/30` | P2P | R-Academico `.1`, R-Admin `.2` | Enlace 10G |
| **WAN** | — | `203.0.113.0/29` | R-Admin `eth3` | Internet-DNS `8.8.8.8` | Salida a Internet |

---

## 🚀 Instalación y puesta en marcha

### Requisitos
- [Bun](https://bun.sh/) 1.x (el proyecto usa `bun.lock`)

### Clonar el repositorio
```bash
git clone https://github.com/unfantasmaenelsistema/Simulador-Redes-Educativo.git
cd Simulador-Redes-Educativo
```

### Instalar dependencias y arrancar
```bash
bun install
bun run dev
```
Abre en tu navegador: [http://localhost:3000](http://localhost:3000)

### Pruebas y compilación
```bash
bun test          # pruebas del motor de red (rutas, VLAN, ACL, TTL, ARP, DNS, HTTP)
bun run lint      # comprobación de tipos
bun run build     # genera dist/
```

Cada push a `main` pasa tipos y pruebas y publica `dist/` en GitHub Pages con el workflow `.github/workflows/pages.yml`.

---

## 📁 Estructura del proyecto

```text
├── .github/workflows/pages.yml     # Pruebas + despliegue en GitHub Pages
├── docs/images/                    # Diagramas en SVG
├── public/assets/aistudio/         # Logotipo "Un Fantasma en el Sistema"
├── src/
│   ├── components/
│   │   ├── DeviceDetailModal.tsx   # Inspector de interfaces, ARP, CAM y VLAN
│   │   ├── LabMissionsModal.tsx    # Misiones guiadas
│   │   ├── LabReportModal.tsx      # Informe de laboratorio (.md)
│   │   ├── NetworkSummaryBar.tsx   # Reproducción, paso a paso y métricas
│   │   ├── NetworkTelemetryDashboard.tsx # Gráficas en tiempo real
│   │   ├── NetworkTopologyCanvas.tsx     # Lienzo SVG con cortes de enlace
│   │   ├── PacketBuilderModal.tsx  # Inyector de PDU y pruebas de TTL
│   │   ├── RouterAclModal.tsx      # Editor, probador y exportación de ACL
│   │   ├── SubnetCalculatorModal.tsx     # Calculadora VLSM y desglose binario
│   │   ├── TerminalConsole.tsx     # Consola de comandos
│   │   ├── TopNav.tsx              # Barra superior
│   │   └── WiresharkInspector.tsx  # Disección de paquetes por capas
│   ├── data/topologyData.ts        # Nodos, enlaces, zonas, ACL iniciales y misiones
│   ├── services/networkEngine.ts   # Motor L2/L3: caminos, VLAN, ACL, TTL, ARP, DNS, HTTP
│   ├── types/network.ts            # Tipos TypeScript
│   ├── utils/audioEffects.ts       # Sintetizador Web Audio
│   ├── App.tsx                     # Estado, animación y comandos
│   └── main.tsx                    # Punto de entrada
├── tests/engine.test.ts            # Pruebas del motor (bun test)
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts                  # base /Simulador-Redes-Educativo/ al publicar en Pages
```

---

## 🤝 Misiones guiadas

1. **ARP y ping local** en el Aula 1 (conmutación en la misma VLAN).
2. **Enrutamiento entre aulas**: la respuesta llega con `ttl=63`.
3. **Aislamiento del Wi-Fi de invitados**: la ACL de R-Academico (`eth4` IN) bloquea el acceso a la red interna.
4. **DNS y web del campus**: `nslookup` + `curl` con handshake TCP y respuesta HTTP 200.
5. **Traceroute multi-router**: `192.168.10.1` → `10.0.0.2` → destino.
6. **Segmentación 802.1Q**: tabla CAM y aislamiento de un puerto en la VLAN 99.
7. **Latencia y encolamiento**: RTT en reposo frente a carga y enlace WAN.

---

## 👤 Autor

Creado por **Un Fantasma en el Sistema**:
- 🌐 Web: [https://www.unfantasmaenelsistema.com/](https://www.unfantasmaenelsistema.com/)
- 📖 Artículos, tutoriales y recursos prácticos sobre redes, ciberseguridad, hacking ético y sistemas.

---

## 📄 Licencia

Este proyecto está bajo la Licencia [MIT](LICENSE): úsalo libremente con fines educativos, académicos o personales.
