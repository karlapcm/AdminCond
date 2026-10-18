import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Building2,
  CreditCard,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
  X,
  UserRoundPlus,
} from "lucide-react";

import { useAuth } from "../context/useAuth";
import { getMyCondominiums } from "../services/condominiums";

const modules = [
  {
    title: "Unidades y residentes",
    description: "Organiza las unidades y relaciones de residencia.",
    icon: Users,
  },
  {
    title: "Cuotas y pagos",
    description: "Consulta las operaciones financieras autorizadas.",
    icon: CreditCard,
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, request, logout } = useAuth();

  const [condominiums, setCondominiums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchCondominiums() {
      try {
        const data = await getMyCondominiums(request);

        if (active) {
          setCondominiums(data);
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(
            err.message || "No se pudieron cargar los condominios."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchCondominiums();

    return () => {
      active = false;
    };
  }, [request]);

  async function handleRefresh() {
    setLoading(true);
    setError("");

    try {
      const data = await getMyCondominiums(request);
      setCondominiums(data);
    } catch (err) {
      setError(
        err.message || "No se pudieron cargar los condominios."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const displayName = user?.nombre || user?.correo || "Usuario";
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
          <Link
            to="/dashboard"
            className="nav-link active"
            onClick={() => setMenuOpen(false)}
          >
            <LayoutDashboard size={19} />
            <span>Dashboard</span>
          </Link>

          <a
            href="#mis-condominios"
            className="nav-link"
            onClick={() => setMenuOpen(false)}
          >
            <Building2 size={19} />
            <span>Mis condominios</span>
          </a>

          <Link
            to="/invitations"
            className="nav-link"
            onClick={() => setMenuOpen(false)}
          >
            <UserRoundPlus size={19} />
            <span>Invitaciones</span>
          </Link>
          
          <Link
            to="/communications"
            className="nav-link"
            onClick={() => setMenuOpen(false)}
          >
            <Bell size={19} />
            <span>Comunicados</span>
          </Link>

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
            <span>Consultas protegidas mediante JWT</span>
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
                Estos son los condominios disponibles para tu cuenta.
              </p>
            </div>

            <span className="environment-label">
              Entorno de desarrollo
            </span>
          </div>

          <section className="welcome-banner">
            <div>
              <span className="banner-kicker">ADMINCOND V1</span>
              <h2>Tu comunidad, en un solo lugar.</h2>
              <p>
                Consulta los condominios a los que tienes acceso
                y continúa con su administración.
              </p>
            </div>
            <Building2 className="banner-icon" size={108} />
          </section>

          <section className="section" id="mis-condominios">
            <div className="section-heading section-heading-row">
              <div>
                <h2>Mis condominios</h2>
                <p>
                  Información obtenida desde PostgreSQL mediante
                  nuestra API Express.
                </p>
              </div>

              <button
                type="button"
                className="refresh-button"
                disabled={loading}
                onClick={handleRefresh}
              >
                <RefreshCw size={16} />
                Actualizar
              </button>
            </div>

            {loading ? (
              <div className="data-state" role="status">
                <LoaderCircle className="spin" size={26} />
                <h3>Cargando condominios...</h3>
                <p>Consultando los datos autorizados de tu cuenta.</p>
              </div>
            ) : error ? (
              <div className="data-state error-state" role="alert">
                <AlertCircle size={26} />
                <h3>No se pudieron obtener los condominios</h3>
                <p>{error}</p>
                <button
                  className="refresh-button"
                  onClick={handleRefresh}
                >
                  Reintentar
                </button>
              </div>
            ) : condominiums.length === 0 ? (
              <div className="data-state">
                <Building2 size={30} />
                <h3>Aún no tienes condominios asignados</h3>
                <p>
                  Cuando tengas una membresía activa en un condominio,
                  aparecerá aquí.
                </p>
              </div>
            ) : (
              <>
                <p className="result-count">
                  {condominiums.length}{" "}
                  {condominiums.length === 1
                    ? "condominio disponible"
                    : "condominios disponibles"}
                </p>

                <div className="condominiums-grid">
                  {condominiums.map((condo) => (
                    <article
                      className="condominium-card"
                      key={String(condo.id)}
                    >
                      <div className="condominium-card-top">
                        <span className="condominium-icon">
                          <Building2 size={23} />
                        </span>

                        <span className="condominium-status">
                          {condo.estado}
                        </span>
                      </div>

                      <h3>{condo.nombre}</h3>

                      <p className="condominium-address">
                        <MapPin size={16} />
                        <span>
                          {condo.direccion || "Dirección no registrada"}
                        </span>
                      </p>

                      <Link
                        className="condominium-link"
                        to={`/condominiums/${encodeURIComponent(condo.id)}`}
                      >
                        Ver detalle
                        <ArrowRight size={17} />
                      </Link>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="section">
            <div className="section-heading">
              <h2>Próximos módulos</h2>
              <p>
                Funcionalidades que iremos integrando a la interfaz.
              </p>
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
                    Interfaz pendiente
                  </span>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}