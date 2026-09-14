import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-[var(--radius-sm)] bg-bg-subtle", className)}
      {...props}
    />
  );
}

export { Skeleton };
