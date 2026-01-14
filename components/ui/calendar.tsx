import * as React from "react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-4",
        month: "space-y-4",
        caption: "flex items-center justify-between text-sm font-medium",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-2",
        nav_button:
          "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted/70",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell: "w-9 text-xs font-medium text-foreground/60",
        row: "mt-2 flex w-full",
        cell: "relative h-9 w-9 text-center text-sm",
        day: "h-9 w-9 rounded-md hover:bg-muted/70 aria-selected:bg-foreground aria-selected:text-background",
        day_selected: "bg-foreground text-background hover:bg-foreground/90",
        day_today: "border border-primary",
        day_outside: "text-foreground/30",
        day_disabled: "text-foreground/20",
        ...classNames,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
