import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LogOut, Settings } from "lucide-react";
import { useAuth } from "../../store/authStore.js";
import Avatar from "./Avatar.jsx";
import NotificationBell from "../../features/notifications/NotificationBell.jsx";
import NLSearchBar from "../../features/search/NLSearchBar.jsx";

const linkClass = ({ isActive }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`;

export default function Navbar() {
  const { user, logout, status } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (!e.target.closest("[data-user-menu]")) setMenuOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [menuOpen]);

  if (status !== "authed" || !user) return null;

  const doLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link to="/" className="text-sm font-semibold text-slate-900">
          MERN Task Manager
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={linkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/tasks" className={linkClass}>
            Tasks
          </NavLink>
          <NavLink to="/projects" className={linkClass}>
            Projects
          </NavLink>
          <NavLink to="/teams" className={linkClass}>
            Teams
          </NavLink>
          <NavLink to="/workspaces" className={linkClass}>
            Workspaces
          </NavLink>
          {user.role === "admin" && (
            <NavLink to="/admin" className={linkClass}>
              Admin
            </NavLink>
          )}
        </nav>
        <div className="flex-1" />
        <NLSearchBar />
        <NotificationBell />
        <div className="relative" data-user-menu>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-100"
          >
            <Avatar name={user.name} src={user.avatar} />
            <span className="hidden text-xs text-slate-700 md:inline">
              {user.name}
            </span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-10 min-w-[180px] rounded-md border border-slate-100 bg-white p-1 shadow-lg"
            >
              <Link
                to="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Settings size={14} /> Settings
              </Link>
              <button
                onClick={doLogout}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
