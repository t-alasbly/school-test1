import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/reports")({
  component: () => <Navigate to="/print" />,
});
