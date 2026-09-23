"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      richColors={false}
      icons={{
        success: <CircleCheckIcon className="size-5 text-turquoise" />,
        info: <InfoIcon className="size-5 text-brand-yellow" />,
        warning: <TriangleAlertIcon className="size-5 text-brand-yellow" />,
        error: <OctagonXIcon className="size-5 text-destructive" />,
        loading: <Loader2Icon className="size-5 animate-spin text-turquoise" />,
        close: <XIcon className="size-5" strokeWidth={2.25} />,
      }}
      toastOptions={{
        classNames: {
          title: "font-semibold",
          description: "text-muted-foreground!",
          actionButton: "bg-brand-yellow! text-primary-foreground! hover:bg-brand-yellow/90!",
          cancelButton: "bg-accent! text-foreground! hover:bg-input!",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--width": "420px",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
