import { LayoutDashboard, FolderOpen, Settings, BarChart3 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { icon: LayoutDashboard, path: "/dashboard", label: "Dashboard" },
  { icon: FolderOpen, path: "/", label: "Documents" },
  { icon: BarChart3, path: "/admin/model-dashboard", label: "Admin", adminOnly: true },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Filter out admin-only items for non-admin users
  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || user?.role === "admin"
  );

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-16 flex-col items-center border-r border-sidebar-border bg-sidebar py-4">
      {/* Logo */}
      <button
        onClick={() => navigate("/")}
        className="mb-8 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg"
      >
        O
      </button>

      {/* Nav icons */}
      <nav className="flex flex-1 flex-col items-center gap-2">
        {visibleNavItems.map(({ icon: Icon, path, label }) => {
          const isActive = path === "/" ? location.pathname === path : location.pathname.startsWith(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              title={label}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </nav>

      {/* Settings at bottom */}
      <button
        onClick={() => navigate("/settings")}
        title="Settings"
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
          location.pathname === "/settings"
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent/50"
        )}
      >
        <Settings className="h-5 w-5" />
      </button>
    </aside>
  );
}
