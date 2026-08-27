import { NavLink } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../store/store";

/**
 * Common app sidebar — used on every authenticated page (Board,
 * Repositories, Sessions, ...). Matches the dark-green-on-black theme
 * from the landing page: black surface, dark-green active/hover state,
 * bubbly hover motion on nav items.
 *
 * Usage:
 *   <div className="flex min-h-screen bg-black">
 *     <Sidebar />
 *     <main className="flex-1">{children}</main>
 *   </div>
 *
 * Each route below assumes react-router paths /board, /repositories,
 * /sessions — adjust `to` values to match your router config.
 */

const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

const NAV_ITEMS = [
  { to: "/board", label: "Board", icon: <IconGrid /> },
  { to: "/repositories", label: "Repositories", icon: <IconRepo /> },
  { to: "/sessions", label: "Sessions", icon: <IconList /> },
];

function Sidebar() {
  const { user } = useSelector((state: RootState) => state.auth);

  const initials = getInitials(user?.username || "You");

  return (
    <aside className="hidden sm:flex w-[190px] shrink-0 flex-col justify-between border-r border-white/[0.06] bg-black p-4 min-h-screen sticky top-0">
      <div>
        <div className="flex items-center gap-2 px-2 mb-6">
          <MarkGlyph />
          <span
            className="text-[13px] font-medium text-white"
            style={{ fontFamily: FONT_MONO }}
          >
            Compass<span className="text-neutral-500">.io</span>
          </span>
        </div>

        <nav
          className="space-y-1 text-[13px] text-neutral-300"
          style={{ fontFamily: FONT_MONO }}
        >
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-item flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors ${
                  isActive
                    ? "bg-emerald-900/30 text-emerald-300"
                    : "text-neutral-300 hover:bg-emerald-950/20 hover:text-emerald-300"
                }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2 px-2">
        <span className="h-7 w-7 rounded-full bg-emerald-900/40 flex items-center justify-center text-[11px] text-emerald-300">
          {initials}
        </span>
        <div className="leading-tight">
          <p className="text-[12px] text-white truncate max-w-[110px]">
            {user?.username || "Guest"}
          </p>
          <p
            className="text-[10px] text-neutral-400"
            style={{ fontFamily: FONT_MONO }}
          >
            Contributor
          </p>
        </div>
      </div>

      <style>{`
        .nav-item {
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
            background-color 0.2s ease, color 0.2s ease;
        }
        .nav-item:hover {
          transform: translateX(2px);
        }
      `}</style>
    </aside>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function MarkGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle
        cx="8"
        cy="8"
        r="7"
        stroke="#22c37a"
        strokeOpacity="0.9"
        strokeWidth="1"
      />
      <line x1="8" y1="1" x2="8" y2="3.4" stroke="#22c37a" strokeWidth="1" />
      <circle cx="8" cy="8" r="1" fill="#22c37a" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none">
      <rect
        x="1.5"
        y="1.5"
        width="4.5"
        height="4.5"
        rx="1"
        stroke="currentColor"
      />
      <rect
        x="8"
        y="1.5"
        width="4.5"
        height="4.5"
        rx="1"
        stroke="currentColor"
      />
      <rect
        x="1.5"
        y="8"
        width="4.5"
        height="4.5"
        rx="1"
        stroke="currentColor"
      />
      <rect x="8" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" />
    </svg>
  );
}

function IconRepo() {
  return (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none">
      <path
        d="M3 1.5h8v11H3a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 3 1.5z"
        stroke="currentColor"
      />
      <line x1="1.5" y1="10" x2="11" y2="10" stroke="currentColor" />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none">
      <line x1="2" y1="3.5" x2="12" y2="3.5" stroke="currentColor" />
      <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" />
      <line x1="2" y1="10.5" x2="12" y2="10.5" stroke="currentColor" />
    </svg>
  );
}

export default Sidebar;
