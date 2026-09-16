import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/permissions")({
  component: function PermissionsRedirect() {
    return <Navigate to="/staff" />;
  },
});
