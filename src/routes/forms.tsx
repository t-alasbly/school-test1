import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/forms")({
  component: () => <Navigate to="/print/forms" />,
});
