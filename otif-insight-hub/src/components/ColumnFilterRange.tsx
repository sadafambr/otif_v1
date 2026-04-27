import { useState, useEffect } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Check, Filter, Trash2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ColumnFilterRangeProps {
    label: string;
    min: number;
    max: number;
    currentMin?: number;
    currentMax?: number;
    onChange: (min: number | undefined, max: number | undefined) => void;
    unit?: string;
    step?: number;
    triggerClassName?: string;
    showLabel?: boolean;
    /** Risk score UI: gradient track, value above, Low/Medium/High zones */
    variant?: "default" | "riskScore";
}

/** Low → high risk: pale mint → dashboard teal → deep blue-teal (no traffic-light red/yellow) */
const RISK_TRACK_GRADIENT =
    "linear-gradient(90deg, hsl(168 38% 90%) 0%, hsl(162 58% 44%) 45%, hsl(198 56% 28%) 100%)";

export function ColumnFilterRange({
    label,
    min,
    max,
    currentMin,
    currentMax,
    onChange,
    unit = "",
    step = 1,
    triggerClassName,
    showLabel,
    variant = "default",
}: ColumnFilterRangeProps) {
    const [open, setOpen] = useState(false);
    const [localMin, setLocalMin] = useState(currentMin ?? min);
    const [localMax, setLocalMax] = useState(currentMax ?? max);

    useEffect(() => {
        if (open) {
            setLocalMin(currentMin ?? min);
            setLocalMax(currentMax ?? max);
        }
    }, [open, currentMin, currentMax, min, max]);

    const handleClear = () => {
        setLocalMin(min);
        setLocalMax(max);
        onChange(undefined, undefined);
        setOpen(false);
    };

    const handleDone = () => {
        const effectiveMin = localMin <= min ? undefined : localMin;
        const effectiveMax = localMax >= max ? undefined : localMax;
        onChange(effectiveMin, effectiveMax);
        setOpen(false);
    };

    const isActive = currentMin !== undefined || currentMax !== undefined;

    const defaultTriggerClass = cn(
        "order-table-filter-trigger",
        isActive
            ? "text-primary opacity-100"
            : "text-muted-foreground opacity-[0.38] hover:!opacity-100 hover:bg-muted/70 hover:text-foreground group-hover/header:opacity-[0.52]",
        "data-[state=open]:bg-muted/65 data-[state=open]:opacity-100 data-[state=open]:text-foreground",
    );

    const popoverWidth =
        variant === "riskScore"
            ? "w-[min(22rem,calc(100vw-1.5rem))]"
            : "w-[min(15rem,calc(100vw-1.5rem))]";

    const triggerBtnClass = cn(triggerClassName ?? defaultTriggerClass, isActive && (showLabel ? "pr-6" : "pr-5"));

    return (
        <div className="group/filter-clear relative inline-flex max-w-full">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button type="button" title={`Filter ${label}`} className={triggerBtnClass}>
                        <Filter className={showLabel ? "h-3 w-3" : "h-2 w-2"} strokeWidth={2.5} />
                        {showLabel && <span className="min-w-0 truncate">{label}</span>}
                        {showLabel && isActive && (
                            <span className="ml-0.5 shrink-0 rounded bg-primary/20 px-1 py-0.5 text-[10px] font-bold text-primary">
                                {currentMin ?? min}
                                {unit}–{currentMax ?? max}
                                {unit}
                            </span>
                        )}
                    </button>
                </PopoverTrigger>
            <PopoverContent
                align="start"
                side="bottom"
                collisionPadding={16}
                className={cn("column-filter-popover z-[100] p-0", popoverWidth)}
                onInteractOutside={() => setOpen(false)}
            >
                {variant === "riskScore" ? (
                    <div className="space-y-1 p-4 pb-3">
                        <p className="text-center text-sm font-semibold tabular-nums text-foreground">
                            {localMin}
                            {unit}
                            <span className="mx-1 text-muted-foreground">–</span>
                            {localMax}
                            {unit}
                        </p>
                        <SliderPrimitive.Root
                            value={[localMin, localMax]}
                            onValueChange={([a, b]) => {
                                setLocalMin(a);
                                setLocalMax(b);
                            }}
                            min={min}
                            max={max}
                            step={step}
                            className="relative flex w-full touch-none select-none items-center py-1"
                        >
                            <SliderPrimitive.Track
                                className="relative h-2.5 w-full grow overflow-hidden rounded-full shadow-inner ring-1 ring-inset ring-black/10 dark:ring-white/10"
                                style={{ background: RISK_TRACK_GRADIENT }}
                            >
                                <SliderPrimitive.Range className="absolute h-full bg-background/35 dark:bg-black/25" />
                            </SliderPrimitive.Track>
                            <SliderPrimitive.Thumb
                                className="block h-5 w-5 rounded-full border-2 border-primary/55 bg-background shadow-md ring-2 ring-primary/25 transition-[transform,box-shadow] hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 dark:border-primary/50 dark:ring-primary/20"
                                aria-label="Minimum risk score"
                            />
                            <SliderPrimitive.Thumb
                                className="block h-5 w-5 rounded-full border-2 border-primary/25 bg-background shadow-md ring-2 ring-primary/15 transition-[transform,box-shadow] hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 dark:border-primary/30 dark:ring-primary/10"
                                aria-label="Maximum risk score"
                            />
                        </SliderPrimitive.Root>
                        <div className="relative pt-2">
                            <div className="pointer-events-none relative mb-1 h-2 w-full" aria-hidden>
                                <div className="absolute left-1/3 top-0 h-2 w-px -translate-x-1/2 rounded-full bg-foreground/20" />
                                <div className="absolute left-2/3 top-0 h-2 w-px -translate-x-1/2 rounded-full bg-foreground/20" />
                            </div>
                            <div className="flex text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                <span className="min-w-0 flex-1 text-left">Low</span>
                                <span className="min-w-0 flex-1 text-center">Medium</span>
                                <span className="min-w-0 flex-1 text-right">High</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 p-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">
                                Min: {localMin}
                                {unit}
                            </label>
                            <Slider
                                value={[localMin]}
                                onValueChange={([v]) => setLocalMin(v)}
                                min={min}
                                max={max}
                                step={step}
                                className="[&_[role=slider]]:bg-primary [&_[role=slider]]:border-primary"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">
                                Max: {localMax}
                                {unit}
                            </label>
                            <Slider
                                value={[localMax]}
                                onValueChange={([v]) => setLocalMax(v)}
                                min={min}
                                max={max}
                                step={step}
                                className="[&_[role=slider]]:bg-primary [&_[role=slider]]:border-primary"
                            />
                        </div>
                    </div>
                )}
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
            {isActive && (
                <button
                    type="button"
                    aria-label={`Remove ${label} filter`}
                    title={`Remove ${label} filter`}
                    className={cn(
                        "absolute right-0.5 top-1/2 z-[1] -translate-y-1/2 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity duration-150",
                        "hover:bg-destructive/15 hover:text-destructive",
                        "pointer-events-none group-hover/filter-clear:pointer-events-auto group-hover/filter-clear:opacity-100",
                        "group-focus-within/filter-clear:pointer-events-auto group-focus-within/filter-clear:opacity-100",
                        "focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    )}
                    onClick={() => {
                        onChange(undefined, undefined);
                        setOpen(false);
                    }}
                >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
            )}
        </div>
    );
}
