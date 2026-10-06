import { Activity, Clock3, PanelLeftClose, PanelLeftOpen, Settings2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Section = "monitor" | "threats" | "events";
export type SidebarHealth = { modelServer: string; mongodb: string; status: string } | null;

const items: Array<{ key: Section; title: string; icon: typeof Activity }> = [
  { key: "monitor", title: "Monitor", icon: Activity },
  { key: "threats", title: "Threat rules", icon: Settings2 },
  { key: "events", title: "Event history", icon: Clock3 },
];

export function Sidebar({
  section,
  onNavigate,
  collapsed,
  onToggle,
  mobileOpen,
  onClose,
  health,
  healthError,
  highThreatClasses,
}: {
  section: Section;
  onNavigate: (section: Section) => void;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onClose: () => void;
  health: SidebarHealth;
  healthError: string;
  highThreatClasses: number;
}) {
  return <>
    {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={onClose} />}
    <aside className={`sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
      <div className="sidebar-brand-row">
        <a className="brand" href="#monitor" onClick={(event) => { event.preventDefault(); onNavigate("monitor"); }} aria-label="Predator Monitor home">
          <span className="brand-mark"><ShieldCheck size={19} strokeWidth={1.7} /></span>
          <span className="brand-copy"><strong>Predator Monitor</strong><small>LOCAL MONITOR</small></span>
        </a>
        <Button variant="ghost" size="icon" className="sidebar-toggle" onClick={onToggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </Button>
      </div>

      <div className="side-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Dashboard sections">
        {items.map((item) => {
          const ItemIcon = item.icon;
          return <button key={item.key} className={`nav-item ${section === item.key ? "active" : ""}`} onClick={() => onNavigate(item.key)} title={collapsed ? item.title : undefined} aria-label={item.title} aria-current={section === item.key ? "page" : undefined}>
            <ItemIcon className="nav-icon" size={17} strokeWidth={1.7} />
            <span className="nav-label">{item.title}</span>
            {item.key === "threats" && highThreatClasses > 0 && <span className="nav-count" title={`${highThreatClasses} high threat classes`}>{highThreatClasses}</span>}
          </button>;
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="connection-card">
          <div className="connection-title"><span className={`connection-dot ${health?.status === "ready" ? "ready" : ""}`} />Services</div>
          <div className="connection-row"><span>Model server</span><strong className={health?.modelServer === "ready" ? "text-ready" : "text-warn"}>{health?.modelServer ?? "checking"}</strong></div>
          <div className="connection-row"><span>MongoDB</span><strong className={health?.mongodb === "ready" ? "text-ready" : "text-warn"}>{health?.mongodb ?? "checking"}</strong></div>
          {healthError && <p className="connection-error">{healthError}</p>}
        </div>
        <div className="collapsed-status" title={`Model: ${health?.modelServer ?? "checking"} · MongoDB: ${health?.mongodb ?? "checking"}`}><span className={`connection-dot ${health?.status === "ready" ? "ready" : ""}`} /><span>LOCAL</span></div>
        <div className="sidebar-footer"><span className="local-dot" /><span className="sidebar-footer-label">This workstation only</span></div>
      </div>
    </aside>
  </>;
}
