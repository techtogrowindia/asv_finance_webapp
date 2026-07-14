import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export interface SideNavItem {
  to?: string;
  label: string;
  icon?: string; // top-level items only; children render without an icon
  perm?: string[];
  end?: boolean;
  children?: SideNavItem[];
}

/** Sidebar navigation with permission filtering + collapsible groups (shared by both portals). */
export function SideNav({
  items,
  can,
  onNavigate,
}: {
  items: SideNavItem[];
  can: (p: string) => boolean;
  onNavigate: () => void;
}) {
  const visible = (i: SideNavItem) => !i.perm || i.perm.some((p) => can(p));
  return (
    <nav className="side-nav">
      {items.filter(visible).map((item) =>
        item.children ? (
          <SideGroup key={item.label} item={item} visible={visible} onNavigate={onNavigate} />
        ) : (
          <NavLink
            key={item.to}
            to={item.to!}
            end={item.end}
            className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}
            onClick={onNavigate}
          >
            <span className="side-ico">{item.icon}</span>
            {item.label}
          </NavLink>
        ),
      )}
    </nav>
  );
}

function SideGroup({
  item,
  visible,
  onNavigate,
}: {
  item: SideNavItem;
  visible: (i: SideNavItem) => boolean;
  onNavigate: () => void;
}) {
  const location = useLocation();
  const children = (item.children ?? []).filter(visible);
  const anyActive = children.some((c) => c.to && location.pathname.startsWith(c.to));
  const [open, setOpen] = useState(anyActive);

  if (children.length === 0) return null;

  return (
    <div className="side-group">
      <button
        type="button"
        className={`side-link side-group-head ${anyActive ? 'active-parent' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="side-ico">{item.icon}</span>
        {item.label}
        <span className={`side-chevron ${open ? 'open' : ''}`}>▸</span>
      </button>
      {open && (
        <div className="side-sub">
          {children.map((c) => (
            <NavLink
              key={c.to}
              to={c.to!}
              end={c.end}
              className={({ isActive }) => `side-sublink ${isActive ? 'active' : ''}`}
              onClick={onNavigate}
            >
              {c.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
