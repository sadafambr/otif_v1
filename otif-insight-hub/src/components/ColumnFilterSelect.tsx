import { useState, useMemo, useEffect } from "react";
import { Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface ColumnFilterSelectProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string | undefined;
  onChange: (value: string | undefined) => void;
}

export function ColumnFilterSelect({ label, options, selected, onChange }: ColumnFilterSelectProps) {
  const [open, setOpen] = useState(false);

  const isActive = selected !== undefined;

  const handleSelect = (value: string | undefined) => {
    onChange(value);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="ml-1 inline-flex items-center focus:outline-none shrink-0"
          title={`Filter ${label}`}
        >
          <Filter
            className={`h-3 w-3 transition-colors ${
              isActive ? "text-primary fill-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="column-filter-popover w-56 p-0"
        onInteractOutside={() => setOpen(false)}
      >
        <div className="p-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              className={`w-full text-left rounded px-3 py-1.5 text-sm transition-colors ${
                selected === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2">
          <button
            onClick={() => handleSelect(undefined)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
          <Button size="sm" onClick={() => setOpen(false)} className="h-7 px-4 text-xs">
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
