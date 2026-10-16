import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";

import { useAuth } from "../context/useAuth";

export default function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(correo.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "No fue posible iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-layout">
      <section className="login-presentation">
        <div className="brand brand-light">
          <span className="brand-symbol">
            <Building2 size={25} strokeWidth={2.1} />
          </span>
          <span>AdminCond</span>
        </div>

        <div className="presentation-content">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            ADMINISTRACIÓN INTELIGENTE
          </div>

          <h1>
            Tu comunidad,
            <br />
            mejor conectada.
          </h1>

          <p>
            Gestiona condominios, residentes, cuotas y pagos
            desde un solo lugar, de forma clara y segura.
          </p>

          <div className="presentation-features">
            <div>
              <ShieldCheck size={20} />
              <span>Accesos y permisos protegidos</span>
            </div>
            <div>
              <Building2 size={20} />
              <span>Gestión centralizada de condominios</span>
            </div>
          </div>
        </div>

        <p className="presentation-footer">
          AdminCond · Plataforma de gestión residencial
        </p>
      </section>

      <main className="login-main">
        <div className="login-card">
          <div className="mobile-brand">
            <Building2 size={25} />
            <span>AdminCond</span>
          </div>

          <span className="section-kicker">BIENVENIDO DE NUEVO</span>
          <h2>Iniciar sesión</h2>
          <p className="login-subtitle">
            Ingresa tus credenciales para acceder a tu espacio.
          </p>

          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="correo">Correo electrónico</label>
            <div className="input-wrapper">
              <Mail size={19} />
              <input
                id="correo"
                type="email"
                autoComplete="username"
                placeholder="correo@ejemplo.com"
                value={correo}
                maxLength={254}
                onChange={(e) => setCorreo(e.target.value)}
                required
              />
            </div>

            <label htmlFor="password">Contraseña</label>
            <div className="input-wrapper">
              <LockKeyhole size={19} />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
                value={password}
                maxLength={128}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>

            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={loading}
            >
              {loading ? "Ingresando..." : "Ingresar a AdminCond"}
              {!loading && <ArrowRight size={19} />}
            </button>
          </form>

          <p className="login-help">
            ¿No tienes acceso? Contacta con el administrador de
            tu condominio.
          </p>
        </div>
      </main>
    </div>
  );
}
