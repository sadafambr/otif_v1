import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  variant?: "default" | "risk" | "success" | "info";
}

const variantStyles = {
  default: "border-border",
  risk: "border-destructive/20",
  success: "border-success/20",
  info: "border-primary/20",
};

const iconVariantStyles = {
  default: "text-muted-foreground",
  risk: "text-destructive",
  success: "text-success",
  info: "text-primary",
};

export function KPICard({ label, value, description, icon: Icon, variant = "default" }: KPICardProps) {
  return (
    <div className={cn("kpi-card animate-fade-in", variantStyles[variant])}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className={cn("rounded-full p-2", iconVariantStyles[variant])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
