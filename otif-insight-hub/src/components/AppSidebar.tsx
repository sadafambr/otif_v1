import { useState, useEffect } from "react";
import { LayoutDashboard, FolderOpen, BarChart3, Settings, LogOut, Moon, Sun } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

const navItems = [
  { icon: LayoutDashboard, path: "/dashboard", label: "Dashboard" },
  { icon: FolderOpen, path: "/", label: "Documents" },
  { icon: BarChart3, path: "/admin/model-dashboard", label: "Admin", adminOnly: true },
];

function getStoredTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return (localStorage.getItem("otif_theme") as "light" | "dark") || "light";
}

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState<"light" | "dark">(getStoredTheme);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("otif_theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || user?.role === "admin"
  );

  const handleLogout = () => {
    setSettingsOpen(false);
    logout();
    navigate("/login");
  };

  const iconBtn = (isActive: boolean) =>
    cn(
      "flex h-9 w-9 items-center justify-center rounded-md transition-[color,transform,background-color] duration-200 ease-out",
      isActive
        ? "text-primary"
        : "text-sidebar-foreground hover:text-foreground"
    );

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[var(--sidebar-width)] flex-col items-center border-r border-sidebar-border/80 bg-sidebar/90 py-3 backdrop-blur-xl transition-[background-color,border-color] duration-300 dark:border-white/[0.08] dark:bg-black/55">
      <button
        onClick={() => navigate("/")}
        className="mb-6 flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold shadow-sm transition-[transform,box-shadow] duration-200 ease-out hover:scale-105 active:scale-95"
        aria-label="Home"
      >
        O
      </button>

      <nav className="flex flex-1 flex-col items-center gap-1" aria-label="Main navigation">
        {visibleNavItems.map(({ icon: Icon, path, label }) => {
          const isActive = path === "/" ? location.pathname === path : location.pathname.startsWith(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              title={label}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className={iconBtn(isActive)}
            >
              <Icon className="h-[18px] w-[18px]" />
            </button>
          );
        })}
      </nav>

      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
        <PopoverTrigger asChild>
          <button
            title="Settings"
            aria-label="Settings"
            className={iconBtn(settingsOpen)}
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="end" sideOffset={10} className="w-44 p-1">
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-[13px] text-popover-foreground transition-colors hover:bg-accent"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5 shrink-0" /> : <Moon className="h-3.5 w-3.5 shrink-0" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <div className="my-0.5 h-px bg-border" />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-[13px] text-destructive transition-colors hover:bg-destructive/10">
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                Logout
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to logout?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will be redirected to the login page. Any unsaved progress may be lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout}>Logout</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </PopoverContent>
      </Popover>
    </aside>
  );
}
