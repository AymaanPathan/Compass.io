import { NavLink } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../store/store";

const NAV_ITEMS = [
  { to: "/issues", label: "Issues" },
  { to: "/repositories", label: "Repositories" },
  { to: "/sessions", label: "Sessions" },
];

function Navbar() {
  const { user } = useSelector((state: RootState) => state.auth);
  const initials = getInitials(user?.username || "You");

  return (
    <header className="sticky top-0 z-40 flex h-12 w-full shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#14120B] px-4">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-[#EDECEC]/90">
            Compass
          </span>
        </div>

        <nav className="hidden items-center gap-0.5 sm:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-[5px] px-2.5 py-1 text-[13px] transition-colors ${
                  isActive
                    ? "bg-white/[0.06] text-[#EDECEC]"
                    : "text-[#EDECEC]/50 hover:text-[#EDECEC]/85"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.08] text-[10px] text-[#EDECEC]/80">
          {initials}
        </span>
        <span className="hidden max-w-[100px] truncate text-[12.5px] text-[#EDECEC]/70 sm:block">
          {user?.username || "Guest"}
        </span>
      </div>
    </header>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default Navbar;
