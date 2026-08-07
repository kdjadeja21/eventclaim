"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { Matcher } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  formatEventDateValue,
  parseEventDateValue,
} from "@/lib/event-date";

export type DatePickerProps = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Inclusive earliest selectable date (local calendar day). */
  fromDate?: Date;
  /** Inclusive latest selectable date (local calendar day). */
  toDate?: Date;
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
  fromDate,
  toDate,
  onChange,
}: DatePickerProps) {
  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] =
    React.useState(defaultValue);
  const selectedValue = isControlled ? value : uncontrolledValue;
  const selectedDate = selectedValue
    ? parseEventDateValue(selectedValue)
    : undefined;
  const [open, setOpen] = React.useState(false);

  const disabledMatchers = React.useMemo(() => {
    const matchers: Matcher[] = [];
    if (fromDate) matchers.push({ before: fromDate });
    if (toDate) matchers.push({ after: toDate });
    return matchers;
  }, [fromDate, toDate]);

  function setDate(next: Date | undefined) {
    const nextValue = next ? formatEventDateValue(next) : "";
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
            defaultMonth={selectedDate ?? fromDate}
            startMonth={fromDate}
            endMonth={toDate}
            disabled={disabledMatchers.length ? disabledMatchers : undefined}
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
