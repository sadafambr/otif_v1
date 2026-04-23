import { useState, useEffect } from "react";
import { Check, Filter, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ColumnFilterDateProps {
    label: string;
    currentStart?: string;
    currentEnd?: string;
    onChange: (start: string | undefined, end: string | undefined) => void;
    triggerClassName?: string;
    showLabel?: boolean;
}

export function ColumnFilterDate({
    label,
    currentStart,
    currentEnd,
    onChange,
    triggerClassName,
    showLabel,
}: ColumnFilterDateProps) {
    const [open, setOpen] = useState(false);
    const [localStart, setLocalStart] = useState(currentStart || "");
    const [localEnd, setLocalEnd] = useState(currentEnd || "");

    // Sync local state when popover opens
    useEffect(() => {
        if (open) {
            setLocalStart(currentStart || "");
            setLocalEnd(currentEnd || "");
        }
    }, [open, currentStart, currentEnd]);

    const handleClear = () => {
        setLocalStart("");
        setLocalEnd("");
        onChange(undefined, undefined);
        setOpen(false);
    };

    const handleDone = () => {
        onChange(localStart || undefined, localEnd || undefined);
        setOpen(false);
    };

    const isActive = !!currentStart || !!currentEnd;

    const defaultTriggerClass = cn(
        "order-table-filter-trigger",
        isActive
            ? "text-primary opacity-100"
            : "text-muted-foreground opacity-[0.38] hover:!opacity-100 hover:bg-muted/70 hover:text-foreground group-hover/header:opacity-[0.52]",
        "data-[state=open]:bg-muted/65 data-[state=open]:opacity-100 data-[state=open]:text-foreground",
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    title={`Filter ${label}`}
                    className={triggerClassName ?? defaultTriggerClass}
                >
                    <Filter className={showLabel ? "h-3 w-3" : "h-2 w-2"} strokeWidth={2.5} />
                    {showLabel && <span>{label}</span>}
                    {showLabel && isActive && (
                        <span className="ml-0.5 rounded bg-primary/20 px-1 py-0.5 text-[10px] font-bold text-primary">
                            {currentStart ?? ""}{currentStart && currentEnd ? " – " : ""}{currentEnd ?? ""}
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                side="bottom"
                collisionPadding={16}
                className="column-filter-popover z-[100] w-[min(16rem,calc(100vw-1.5rem))] p-0"
                onInteractOutside={() => setOpen(false)}
            >
                <div className="p-4 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            From Date
                        </label>
                        <Input
                            type="date"
                            value={localStart}
                            onChange={(e) => setLocalStart(e.target.value)}
                            className="h-8 text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            To Date
                        </label>
                        <Input
                            type="date"
                            value={localEnd}
                            onChange={(e) => setLocalEnd(e.target.value)}
                            className="h-8 text-sm"
                        />
                    </div>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/[0.07] px-3 py-2.5">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleClear}
                        className="h-8 gap-1.5 rounded-full border border-border/70 bg-background px-2.5 text-xs font-medium text-muted-foreground shadow-sm hover:border-primary/40 hover:bg-primary/[0.06] hover:text-foreground"
                    >
                        <Trash2 className="h-3.5 w-3.5 text-destructive/80" strokeWidth={2.25} />
                        Clear
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={handleDone}
                        className="h-9 gap-1.5 rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90"
                    >
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                        Done
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
