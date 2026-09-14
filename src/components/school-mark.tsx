import { cn } from "@/lib/utils";

export function SchoolMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? "size-24" : size === "sm" ? "size-10" : "size-12";
  return (
    <span
      className={cn("inline-block shrink-0 overflow-hidden bg-[#0b1f3a]", dim, className)}
      aria-hidden
    >
      <img
        src="/app-logo.jpg"
        alt=""
        className="size-full object-cover"
        draggable={false}
      />
    </span>
  );
}
