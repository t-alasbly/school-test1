import { cn } from "@/lib/utils";

export function SchoolMark({
  className,
  size = "md",
  src,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  src?: string;
}) {
  const dim = size === "lg" ? "size-24" : size === "sm" ? "size-10" : "size-12";
  return (
    <span
      className={cn(
        "inline-block shrink-0 overflow-hidden rounded-[0.85rem] bg-white ring-1 ring-border/70",
        dim,
        className,
      )}
      aria-hidden
    >
      <img
        src={src || "/app-logo.jpg"}
        alt=""
        className="size-full object-contain"
        draggable={false}
      />
    </span>
  );
}
