import { useState, useEffect } from "react";
import { Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

interface ColumnFilterRangeProps {
    label: string;
    min: number;
    max: number;
    currentMin?: number;
    currentMax?: number;
    onChange: (min: number | undefined, max: number | undefined) => void;
    unit?: string;
    step?: number;
}

export function ColumnFilterRange({
    label,
    min,
    max,
    currentMin,
    currentMax,
    onChange,
    unit = "",
    step = 1,
}: ColumnFilterRangeProps) {
    const [open, setOpen] = useState(false);
    const [localMin, setLocalMin] = useState(currentMin ?? min);
    const [localMax, setLocalMax] = useState(currentMax ?? max);

    // Sync local state when popover opens
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

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    className="ml-1 inline-flex items-center focus:outline-none"
                    title={`Filter ${label}`}
                >
                    <Filter
                        className={`h-3 w-3 transition-colors ${isActive ? "text-primary fill-primary" : "text-muted-foreground hover:text-foreground"
                            }`}
                    />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="column-filter-popover w-60 p-0"
                onInteractOutside={() => setOpen(false)}
            >
                <div className="p-4 space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">
                            Min: {localMin}{unit}
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
                            Max: {localMax}{unit}
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
                <div className="flex items-center justify-between border-t px-3 py-2">
                    <button
                        onClick={handleClear}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Clear
                    </button>
                    <Button size="sm" onClick={handleDone} className="h-7 px-4 text-xs">
                        Done
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
