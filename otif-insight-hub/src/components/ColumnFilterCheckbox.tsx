import { useState, useMemo, useRef, useEffect } from "react";
import { Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ColumnFilterCheckboxProps {
    label: string;
    options: string[];
    selected: Set<string>;
    onChange: (selected: Set<string>) => void;
}

export function ColumnFilterCheckbox({ label, options, selected, onChange }: ColumnFilterCheckboxProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(selected));

    // Sync local state when popover opens
    useEffect(() => {
        if (open) {
            setLocalSelected(new Set(selected));
            setSearch("");
        }
    }, [open, selected]);

    const filteredOptions = useMemo(() => {
        if (!search) return options;
        const q = search.toLowerCase();
        return options.filter((o) => o.toLowerCase().includes(q));
    }, [options, search]);

    const toggleOption = (option: string) => {
        const next = new Set(localSelected);
        if (next.has(option)) {
            next.delete(option);
        } else {
            next.add(option);
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

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    className="ml-1 inline-flex items-center focus:outline-none shrink-0"
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
                className="column-filter-popover w-56 p-0"
                onInteractOutside={() => setOpen(false)}
            >
                <div className="p-3">
                    <Input
                        placeholder={`Search ${label}...`}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="mb-2 h-8 text-sm border-primary/40 focus-visible:ring-primary/30"
                    />
                    <div className="max-h-44 overflow-y-auto space-y-1">
                        {filteredOptions.length === 0 && (
                            <p className="text-xs text-muted-foreground py-2 text-center">No matches</p>
                        )}
                        {filteredOptions.map((option) => (
                            <label
                                key={option}
                                className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-muted/50 text-sm"
                            >
                                <Checkbox
                                    checked={localSelected.has(option)}
                                    onCheckedChange={() => toggleOption(option)}
                                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                                <span className="truncate">{option}</span>
                            </label>
                        ))}
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
