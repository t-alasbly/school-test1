import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        default: "border-border bg-muted text-fg-muted",
        danger: "border-transparent bg-danger-soft text-danger",
        warn: "border-transparent bg-warn-soft text-warn",
        ok: "border-transparent bg-ok-soft text-ok",
        primary: "border-transparent bg-primary text-primary-fg",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
