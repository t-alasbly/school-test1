import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-center"
      dir="rtl"
      toastOptions={{
        classNames: {
          toast:
            "group toast border-border bg-bg-elevated text-fg shadow-[var(--shadow-card)]",
          description: "text-fg-muted",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
