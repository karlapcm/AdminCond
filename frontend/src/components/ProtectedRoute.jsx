
import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../context/useAuth";
import { CondominiumProvider } from "../context/CondominiumContext";

export default function ProtectedRoute() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <CondominiumProvider>
      <Outlet />
    </CondominiumProvider>
  );
}
