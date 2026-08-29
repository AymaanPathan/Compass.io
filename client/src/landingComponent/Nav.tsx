import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../store/storeHook";
import { logout } from "../store/authSlice";

function MarkGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle
        cx="8"
        cy="8"
        r="7"
        stroke="white"
        strokeOpacity="0.8"
        strokeWidth="1"
      />
      <line x1="8" y1="1" x2="8" y2="3.4" stroke="white" strokeWidth="1" />
      <circle cx="8" cy="8" r="1" fill="white" />
    </svg>
  );
}

const NAV_LINKS = [
  { to: "/sessions", label: "Profile" },
  { to: "/repositories", label: "Repositories" },
  { to: "/issues", label: "Issues" },
];

export default function Nav() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);

  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#14120B]">
      <div className="flex items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-8">
          <Link to="/sessions" className="flex items-center gap-2.5">
            <MarkGlyph />
            <span className="font-mono-brand text-xs uppercase tracking-[0.2em] text-white">
              Compass
            </span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `rounded-[5px] px-2.5 py-1 text-[13px] transition-colors ${
                    isActive
                      ? "bg-white/[0.06] text-[#EDECEC]"
                      : "text-[#EDECEC]/50 hover:text-[#EDECEC]/85"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <div className="flex items-center gap-2">
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="h-6 w-6 rounded-full"
              />
              <span className="font-mono-brand text-[11px] text-neutral-400">
                {user.username}
              </span>
            </div>
          )}
          <button
            onClick={async () => {
              await dispatch(logout());
              navigate("/");
            }}
            className="font-mono-brand text-[11px] text-neutral-600 transition-colors hover:text-neutral-300"
          >
            sign out
          </button>
        </div>
      </div>
    </header>
  );
}
