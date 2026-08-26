import { Link, useNavigate } from "react-router-dom";
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

export default function Nav() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);

  return (
    <header className="border-b border-white/[0.06] bg-black/80 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/analysis" className="flex items-center gap-2.5">
          <MarkGlyph />
          <span className="font-mono-brand text-xs uppercase tracking-[0.2em] text-white">
            Compass
          </span>
        </Link>

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
            className="font-mono-brand text-[11px] text-neutral-600 hover:text-neutral-300 transition-colors"
          >
            sign out
          </button>
        </div>
      </div>
    </header>
  );
}
