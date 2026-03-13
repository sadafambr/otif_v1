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
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">{value}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground/70 line-clamp-1">{description}</p>
        </div>
        <div className={cn("rounded-full p-1.5 bg-background/20 backdrop-blur-sm", iconVariantStyles[variant])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
