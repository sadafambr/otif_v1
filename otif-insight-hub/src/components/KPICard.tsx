import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string | number;
  description: string;
  /** How this KPI is computed (shown under the description). */
  calculation?: string;
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

export function KPICard({ label, value, description, calculation, icon: Icon, variant = "default" }: KPICardProps) {
  return (
    <div className={cn("kpi-card group animate-fade-in", variantStyles[variant])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">{value}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground/70">{description}</p>
          {calculation ? (
            <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out group-hover:grid-rows-[1fr] group-focus-within:grid-rows-[1fr]">
              <div className="min-h-0 overflow-hidden">
                <p className="mt-2 border-t border-border/50 pt-2 text-[10px] leading-snug text-muted-foreground whitespace-pre-line">
                  {calculation}
                </p>
              </div>
            </div>
          ) : null}
        </div>
        <div
          className={cn(
            "rounded-full bg-background/25 p-1.5 backdrop-blur-sm transition-[background-color,transform] duration-300 ease-out",
            iconVariantStyles[variant],
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
