
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CondominiumDetail from "./pages/CondominiumDetail";
import Invitations from "./pages/Invitations";
import Communications from "./pages/Communications";
import Reservations from "./pages/Reservations";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route
              path="/dashboard"
              element={<Dashboard />}
            />

            <Route
              path="/condominiums/:condominioId"
              element={<CondominiumDetail />}
            />

            <Route
              path="/invitations"
              element={<Invitations />}
            />

            <Route
              path="/communications"
              element={<Communications />}
            />

            <Route
              path="/reservations"
              element={<Reservations />}
            />
          </Route>

          <Route
            path="*"
            element={<Navigate to="/dashboard" replace />}
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
