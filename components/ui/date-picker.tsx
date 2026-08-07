"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function parseDateValue(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export type DatePickerProps = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onChange?: (value: string) => void;
};

export function DatePicker({
  id,
  name,
  value,
  defaultValue = "",
  required,
  disabled,
  placeholder = "Pick a date",
  className,
  onChange,
}: DatePickerProps) {
  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const selectedValue = isControlled ? value : uncontrolledValue;
  const selectedDate = selectedValue ? parseDateValue(selectedValue) : undefined;
  const [open, setOpen] = React.useState(false);

  function setDate(next: Date | undefined) {
    const nextValue = next ? formatDateValue(next) : "";
    if (!isControlled) {
      setUncontrolledValue(nextValue);
    }
    onChange?.(nextValue);
    if (next) {
      setOpen(false);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal",
              !selectedDate && "text-muted-foreground"
            )}
            aria-required={required || undefined}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {selectedDate ? format(selectedDate, "PPP") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setDate}
            defaultMonth={selectedDate}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      <input
        type="text"
        name={name}
        value={selectedValue}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        readOnly
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        onChange={() => {
          /* Controlled by the calendar; kept for native form validation. */
        }}
      />
    </div>
  );
}
