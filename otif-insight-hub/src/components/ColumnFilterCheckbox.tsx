import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback, memo, useDeferredValue } from "react";
import { Check, Filter, ListChecks, ListX, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ColumnFilterCheckboxProps {
    label: string;
    options: string[];
    selected: Set<string>;
    onChange: (selected: Set<string>) => void;
    triggerClassName?: string;
    showLabel?: boolean;
}

const compactActionClass =
    "h-7 gap-1 rounded-md border-0 bg-muted/45 px-1.5 text-[11px] font-medium text-muted-foreground shadow-none transition-colors hover:bg-muted/75 hover:text-foreground";

const VIRTUAL_ROW_PX = 36;
const VIRTUAL_OVERSCAN = 10;

export const ColumnFilterCheckbox = memo(function ColumnFilterCheckbox({
    label,
    options,
    selected,
    onChange,
    triggerClassName,
    showLabel,
}: ColumnFilterCheckboxProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(selected));
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportH, setViewportH] = useState(240);
    const listViewportRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) {
            setLocalSelected(new Set(selected));
            setSearch("");
            setScrollTop(0);
        }
    }, [open, selected]);

    const deferredSearch = useDeferredValue(search);
    const filteredOptions = useMemo(() => {
        if (!deferredSearch) return options;
        const q = deferredSearch.toLowerCase();
        return options.filter((o) => o.toLowerCase().includes(q));
    }, [options, deferredSearch]);

    useLayoutEffect(() => {
        if (!open) return;
        const el = listViewportRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            setViewportH(el.clientHeight);
        });
        ro.observe(el);
        setViewportH(el.clientHeight);
        return () => ro.disconnect();
    }, [open]);

    const onListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    }, []);

    const totalRows = filteredOptions.length;
    const vStart =
        totalRows === 0
            ? 0
            : Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_PX) - VIRTUAL_OVERSCAN);
    const vEnd =
        totalRows === 0
            ? 0
            : Math.min(totalRows, Math.ceil((scrollTop + viewportH) / VIRTUAL_ROW_PX) + VIRTUAL_OVERSCAN);
    const virtualSlice = totalRows === 0 ? [] : filteredOptions.slice(vStart, vEnd);
    const totalH = totalRows * VIRTUAL_ROW_PX;
    const padTop = vStart * VIRTUAL_ROW_PX;

    const toggleOption = (option: string) => {
        const next = new Set(localSelected);
        if (next.has(option)) {
            next.delete(option);
        } else {
            next.add(option);
        }
        setLocalSelected(next);
    };

    const handleSelectAllVisible = () => {
        setLocalSelected(new Set([...localSelected, ...filteredOptions]));
    };

    const handleDeselectVisible = () => {
        const next = new Set(localSelected);
        for (const o of filteredOptions) {
            next.delete(o);
        }
        setLocalSelected(next);
    };

    const handleClear = () => {
        setLocalSelected(new Set());
        onChange(new Set());
        setOpen(false);
    };

    const handleDone = () => {
        onChange(new Set(localSelected));
        setOpen(false);
    };

    const isActive = selected.size > 0;

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
                            {selected.size}
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                side="bottom"
                collisionPadding={16}
                className={cn(
                    "column-filter-popover z-[100] flex max-h-[min(85dvh,22rem)] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden p-0",
                )}
                onInteractOutside={() => setOpen(false)}
            >
                <div className="shrink-0 space-y-2 p-3 pb-2">
                    <Input
                        placeholder={`Search ${label}…`}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-9 text-sm border-primary/35 focus-visible:border-primary/50 focus-visible:ring-primary/25"
                    />
                </div>
                <div
                    ref={listViewportRef}
                    className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-2"
                    onScroll={onListScroll}
                >
                    {totalRows === 0 && (
                        <p className="py-6 text-center text-xs text-muted-foreground">No matches</p>
                    )}
                    {totalRows > 0 && (
                        <div className="relative w-full" style={{ height: totalH }}>
                            <div
                                className="absolute left-0 right-0 top-0"
                                style={{ transform: `translateY(${padTop}px)` }}
                            >
                                {virtualSlice.map((option, i) => {
                                    const idx = vStart + i;
                                    return (
                                        <label
                                            key={`${idx}-${option}`}
                                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-muted/55"
                                            style={{ minHeight: VIRTUAL_ROW_PX, height: VIRTUAL_ROW_PX }}
                                        >
                                            <Checkbox
                                                checked={localSelected.has(option)}
                                                onCheckedChange={() => toggleOption(option)}
                                                className="data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                                            />
                                            <span className="min-w-0 flex-1 truncate text-left" title={option}>
                                                {option}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                <div className="shrink-0 border-t border-border/50 bg-muted/20 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={compactActionClass}
                                onClick={handleSelectAllVisible}
                                title="Select all (search scope)"
                            >
                                <ListChecks className="h-3.5 w-3.5 shrink-0 text-primary/85" strokeWidth={2.25} />
                                All
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={compactActionClass}
                                onClick={handleDeselectVisible}
                                title="Deselect visible (search scope)"
                            >
                                <ListX className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2.25} />
                                None
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={compactActionClass}
                                onClick={handleClear}
                                title="Clear filter"
                            >
                                <Trash2 className="h-3.5 w-3.5 shrink-0 text-destructive/75" strokeWidth={2.25} />
                                Clear
                            </Button>
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleDone}
                            className="h-8 shrink-0 gap-1 rounded-full bg-primary px-4 text-[11px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                        >
                            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                            Done
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
});
