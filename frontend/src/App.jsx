
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
import Community from './pages/Community';
import Recovery from './pages/Recovery';
import Workspace from './pages/Workspace';
import Platform from './pages/Platform';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Community />} />
          <Route path="/recover-access" element={<Recovery />} />
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/platform" element={<Platform />} />
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
