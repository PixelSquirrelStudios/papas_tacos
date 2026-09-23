"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type DayPickerProps } from "react-day-picker"
import { cn } from "cn"

function Calendar({ className, classNames, ...props }: DayPickerProps) {
  return <DayPicker
    className={cn("p-3", className)}
    classNames={{
      root: "relative",
      months: "flex flex-col",
      month: "space-y-4",
      month_caption: "grid h-9 place-items-center px-10",
      caption_label: "leading-none text-sm font-semibold text-foreground",
      nav: "absolute inset-x-3 top-3 flex h-9 items-center justify-between",
      button_previous: "grid size-9 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
      button_next: "grid size-9 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
      month_grid: "block w-[252px] border-collapse",
      weekdays: "grid grid-cols-7",
      weekday: "grid size-9 place-items-center p-0 text-center text-xs font-medium text-muted-foreground",
      weeks: "block",
      week: "mt-2 grid grid-cols-7",
      day: "relative size-9 p-0 text-center text-sm",
      day_button: "grid size-9 cursor-pointer place-items-center rounded-md transition-colors hover:bg-brand-yellow hover:text-background disabled:cursor-not-allowed",
      selected: "[&_button]:bg-brand-yellow [&_button]:font-bold [&_button]:text-background [&_button]:hover:bg-brand-yellow",
      today: "[&_button]:border [&_button]:border-brand-yellow [&_button]:text-brand-yellow",
      outside: "text-muted-foreground opacity-35",
      disabled: "pointer-events-none text-muted-foreground opacity-30",
      hidden: "invisible",
      ...classNames,
    }}
    components={{
      Chevron: ({ orientation, className: chevronClassName }) => orientation === "left"
        ? <ChevronLeft className={cn("size-4", chevronClassName)} />
        : <ChevronRight className={cn("size-4", chevronClassName)} />,
    }}
    {...props}
  />
}

export { Calendar }