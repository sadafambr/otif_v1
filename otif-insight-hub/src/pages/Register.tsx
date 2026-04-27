import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS: { value: "admin" | "user"; label: string }[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const roleMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!roleMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (roleMenuRef.current && !roleMenuRef.current.contains(e.target as Node)) {
        setRoleMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [roleMenuOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await register(email, password, role);
      setSuccess("Account created. You can now sign in.");
      navigate("/login");
    } catch (err: any) {
      setError(err.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.12),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.18),transparent)]"
        aria-hidden
      />
      <div className="auth-glass-panel relative">
        <h1 className="mb-2 text-2xl font-bold text-foreground">Create an account</h1>
        <p className="mb-6 text-sm text-muted-foreground">Provision access to the OTIF Insight Hub.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Create a strong password"
            />
          </div>
          <div className="space-y-1">
            <label id="register-role-label" className="text-sm font-medium text-foreground">
              Role
            </label>
            <div ref={roleMenuRef} className="relative">
              <button
                type="button"
                id="register-role-trigger"
                aria-haspopup="listbox"
                aria-expanded={roleMenuOpen}
                aria-labelledby="register-role-label register-role-trigger"
                onClick={() => setRoleMenuOpen((o) => !o)}
                className={cn(
                  "register-role-select-trigger flex h-10 w-full items-center justify-between border border-input bg-background px-3 py-2 text-left text-sm text-foreground shadow-sm outline-none transition-[border-radius,box-shadow]",
                  "hover:border-primary/35 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  roleMenuOpen
                    ? "rounded-t-xl rounded-b-none border-b-0 border-primary/40 shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]"
                    : "rounded-xl",
                )}
              >
                <span className="capitalize">{role === "admin" ? "Admin" : "User"}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    roleMenuOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
              {roleMenuOpen && (
                <div
                  className="absolute left-0 right-0 top-full z-50 overflow-hidden rounded-b-xl border border-t-0 border-primary/35 bg-popover text-popover-foreground shadow-lg shadow-primary/10"
                  role="listbox"
                  aria-labelledby="register-role-label"
                >
                  <ul className="py-1">
                    {ROLE_OPTIONS.map((opt) => {
                      const selected = role === opt.value;
                      return (
                        <li key={opt.value} role="presentation" className="px-1">
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={cn(
                              "flex w-full rounded-lg px-3 py-2.5 text-left text-sm outline-none transition-colors",
                              selected
                                ? "bg-primary font-medium text-primary-foreground shadow-sm"
                                : "text-foreground hover:bg-primary/15 hover:text-foreground dark:hover:bg-primary/20",
                            )}
                            onClick={() => {
                              setRole(opt.value);
                              setRoleMenuOpen(false);
                            }}
                          >
                            {opt.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="h-2.5 w-full bg-primary" aria-hidden />
                </div>
              )}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-success">{success}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Register"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

