import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 4_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={250}>
        {children}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
