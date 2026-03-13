import { useState, useEffect } from "react";
import { Filter, Calendar } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ColumnFilterDateProps {
    label: string;
    currentStart?: string;
    currentEnd?: string;
    onChange: (start: string | undefined, end: string | undefined) => void;
}

export function ColumnFilterDate({
    label,
    currentStart,
    currentEnd,
    onChange,
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
                className="column-filter-popover w-64 p-0"
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
