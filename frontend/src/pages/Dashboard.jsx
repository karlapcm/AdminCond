import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Building2,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { useAuth } from "../context/useAuth";

const modules = [
  {
    title: "Condominios",
    description: "Consulta y administra tus condominios.",
    icon: Building2,
  },
  {
    title: "Unidades y residentes",
    description: "Organiza unidades y relaciones de residencia.",
    icon: Users,
  },
  {
    title: "Cuotas y pagos",
    description: "Gestiona las operaciones financieras autorizadas.",
    icon: CreditCard,
  },
  {
    title: "Comunicados",
    description: "Próximamente: avisos para tu comunidad.",
    icon: Bell,
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, request, logout } = useAuth();

  const [serverUser, setServerUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const result = await request("/api/auth/me");

        if (active) {
          setServerUser(result.user);
        }
      } catch (err) {
        if (active) {
          setError(err.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [request]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const displayName =
    serverUser?.nombre ||
    user?.nombre ||
    user?.correo ||
    "Usuario";

  const firstName = displayName.split(" ")[0];

  return (
    <div className="dashboard-layout">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <div className="brand brand-dark">
            <span className="brand-symbol">
              <Building2 size={23} />
            </span>
            <span>AdminCond</span>
          </div>

          <button
            className="mobile-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={22} />
          </button>
        </div>

        <div className="sidebar-label">ESPACIO DE TRABAJO</div>

        <nav className="sidebar-nav">
          <div className="nav-link active">
            <LayoutDashboard size={19} />
            <span>Dashboard</span>
          </div>
          <div className="nav-link disabled">
            <Building2 size={19} />
            <span>Condominios</span>
          </div>
          <div className="nav-link disabled">
            <Users size={19} />
            <span>Residentes</span>
          </div>
          <div className="nav-link disabled">
            <Wallet size={19} />
            <span>Finanzas</span>
          </div>
        </nav>

        <div className="sidebar-bottom">
          <div className="security-note">
            <ShieldCheck size={18} />
            <span>Acceso protegido mediante JWT</span>
          </div>
          <button className="logout-button" onClick={handleLogout}>
            <LogOut size={19} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {menuOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Cerrar navegación"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="dashboard-main">
        <header className="topbar">
          <button
            className="menu-button"
            aria-label="Abrir menú"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={23} />
          </button>

          <div className="topbar-title">Panel de administración</div>

          <div className="user-chip">
            <span className="user-avatar">
              {firstName.charAt(0).toUpperCase()}
            </span>
            <span>{displayName}</span>
          </div>
        </header>

        <main className="dashboard-content">
          <div className="welcome-heading">
            <div>
              <span className="section-kicker">TU ESPACIO DE TRABAJO</span>
              <h1>¡Hola, {firstName}!</h1>
              <p>
                Bienvenido a AdminCond. Aquí podrás gestionar tu comunidad.
              </p>
            </div>
            <span className="environment-label">
              Entorno de desarrollo
            </span>
          </div>

          <section className="welcome-banner">
            <div>
              <span className="banner-kicker">ADMINCOND V1</span>
              <h2>Una forma más simple de administrar.</h2>
              <p>
                Estamos construyendo una experiencia segura para
                condominios, administradores y residentes.
              </p>
            </div>
            <Building2 className="banner-icon" size={108} />
          </section>

          <section className="section">
            <div className="section-heading">
              <h2>Módulos de la plataforma</h2>
              <p>Vista inicial de las funciones que tendrá AdminCond.</p>
            </div>

            <div className="modules-grid">
              {modules.map(({ title, description, icon: Icon }) => (
                <article className="module-card" key={title}>
                  <span className="module-icon">
                    <Icon size={23} />
                  </span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <span className="module-status">
                    Integración visual pendiente
                  </span>
                </article>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <h2>Estado de tu sesión</h2>
              <p>
                Verificación de identidad mediante nuestra API Express.
              </p>
            </div>

            <div className="profile-card">
              <div className="profile-header">
                <ShieldCheck size={22} />
                <strong>Autenticación del backend</strong>
              </div>

              {loading ? (
                <p>Consultando /api/auth/me...</p>
              ) : error ? (
                <p className="profile-error">{error}</p>
              ) : (
                <div className="profile-details">
                  <div>
                    <span>Estado</span>
                    <strong>Sesión verificada</strong>
                  </div>
                  <div>
                    <span>Usuario</span>
                    <strong>{displayName}</strong>
                  </div>
                  <div>
                    <span>Correo</span>
                    <strong>
                      {serverUser?.correo || user?.correo || "—"}
                    </strong>
                  </div>
                  <div>
                    <span>ID</span>
                    <strong>{String(serverUser?.id ?? user?.id)}</strong>
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
