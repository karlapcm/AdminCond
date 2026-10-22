import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
  UserRoundPlus,
} from "lucide-react";

import { useAuth } from "../context/useAuth";
import { getMyCondominiums } from "../services/condominiums";
import "./Dashboard.css";
import ContextSelector from "../components/ContextSelector";

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
  // Contexto comunicado por ContextSelector.
  const [navigationContext, setNavigationContext] = useState({
    condominioId: "",
    contexto: null,
  });

  const handleContextChange = useCallback((value) => {
    setNavigationContext(value);
  }, []);

  const selectedCondominiumId = navigationContext.condominioId;
  const activeContext = navigationContext.contexto;

  const canSeeReservations =
    activeContext?.rolCondominio === "administrador" ||
    (activeContext?.unidades?.length ?? 0) > 0;

  const communicationsUrl = selectedCondominiumId && activeContext
    ? `/communications?condominioId=${encodeURIComponent(selectedCondominiumId)}`
    : "/communications";

  const reservationsUrl = selectedCondominiumId && activeContext
    ? `/reservations?condominioId=${encodeURIComponent(selectedCondominiumId)}`
    : "/reservations";

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
        if (active) setError(err.message || "No se pudieron cargar los condominios.");
      } finally {
        if (active) setLoading(false);
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
      setCondominiums(await getMyCondominiums(request));
    } catch (err) {
      setError(err.message || "No se pudieron cargar los condominios.");
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
  const availableCount = condominiums.length;

  
  return (
    <div className="dashboard-layout ac-dashboard">
      {/* MENÚ LATERAL */}
      <aside
        className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}
        aria-label="Navegación principal"
      >
        <div className="sidebar-header">
          <div className="brand brand-dark">
            <span className="brand-symbol">
              <Building2 size={22} />
            </span>
            <span>
              AdminCond<span className="ac-brand-period">.</span>
            </span>
          </div>

          <button
            type="button"
            className="mobile-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={21} />
          </button>
        </div>

        <div className="sidebar-label">
          ESPACIO DE TRABAJO
        </div>

        <nav className="sidebar-nav" aria-label="Secciones">
          {/* Dashboard */}
          <Link
            to="/dashboard"
            aria-current="page"
            className="nav-link active"
            onClick={() => setMenuOpen(false)}
          >
            <LayoutDashboard size={19} />
            <span>Dashboard</span>
          </Link>

          {/* Mis condominios */}
          <a
            href="#mis-condominios"
            className="nav-link"
            onClick={() => setMenuOpen(false)}
          >
            <Building2 size={19} />
            <span>Mis condominios</span>
          </a>

          {/* Invitaciones: también permite aceptar tokens */}
          <Link
            to="/invitations"
            className="nav-link"
            onClick={() => setMenuOpen(false)}
          >
            <UserRoundPlus size={19} />
            <span>Invitaciones</span>
          </Link>

          {/* Reservas: según contexto seleccionado */}
          {canSeeReservations && (
            <Link
              to={reservationsUrl}
              className="nav-link"
              onClick={() => setMenuOpen(false)}
            >
              <CalendarDays size={19} />
              <span>Reservas</span>
            </Link>
          )}

          {/* Comunicados: para condominios autorizados */}
          <Link
            to={communicationsUrl}
            className="nav-link"
            onClick={() => setMenuOpen(false)}
          >
            <Bell size={19} />
            <span>Comunicados</span>
          </Link>

          {/* Módulos pendientes */}
          <div
            className="nav-link disabled"
            aria-disabled="true"
            title="Interfaz pendiente"
          >
            <Users size={19} />
            <span>Residentes</span>
            <span className="ac-soon">Pronto</span>
          </div>

          <div
            className="nav-link disabled"
            aria-disabled="true"
            title="Interfaz pendiente"
          >
            <Wallet size={19} />
            <span>Finanzas</span>
            <span className="ac-soon">Pronto</span>
          </div>
        </nav>

        {/* PARTE INFERIOR DEL SIDEBAR */}
        <div className="sidebar-bottom">
          <div className="ac-sidebar-info">
            <span className="ac-info-icon">
              <ShieldCheck size={19} />
            </span>

            <div>
              <strong>Acceso protegido</strong>
              <span>Sesión autenticada</span>
            </div>
          </div>

          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* FONDO PARA CERRAR EL MENÚ EN MÓVIL */}
      {menuOpen && (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Cerrar navegación"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* CONTENIDO PRINCIPAL */}
      <div className="dashboard-main">
        {/* BARRA SUPERIOR */}
        <header className="topbar">
          <div className="ac-topbar-left">
            <button
              type="button"
              className="menu-button"
              aria-label="Abrir menú"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={23} />
            </button>

            <span className="ac-breadcrumb">
              Mi espacio
              <ChevronRight size={14} />
              <strong>Dashboard</strong>
            </span>
          </div>

          <div className="user-chip">
            <span
              className="user-avatar"
              aria-hidden="true"
            >
              {firstName.charAt(0).toUpperCase()}
            </span>

            <span className="ac-user-name">
              {displayName}
            </span>
          </div>
        </header>

        <main
          className="dashboard-content"
          id="contenido-principal"
        >
          {/* BIENVENIDA */}
          <div className="welcome-heading">
            <div>
              <span className="section-kicker">
                <Sparkles size={15} />
                BIENVENIDO A ADMINCOND
              </span>

              <h1>
                Hola, {firstName}{" "}
                <span aria-hidden="true">👋</span>
              </h1>

              <p>
                Gestiona tus espacios desde un solo lugar,
                con claridad y tranquilidad.
              </p>
            </div>

            <span className="environment-label">
              <span className="ac-status-dot" />
              AdminCond V1
            </span>
          </div>

          {/* SELECTOR CLIENTE → CONDOMINIO */}
          <ContextSelector
            condominiums={condominiums}
            loading={loading}
            onContextChange={handleContextChange}
          />

          {/* TARJETAS DE RESUMEN */}
          <section
            className="ac-overview"
            aria-label="Resumen de tu cuenta"
          >
            <article className="ac-overview-card ac-overview-primary">
              <div className="ac-overview-icon">
                <Building2 size={23} />
              </div>

              <div className="ac-overview-copy">
                <span>Mis condominios</span>
                <strong>
                  {loading || error ? "—" : availableCount}
                </strong>
                <small>
                  {error
                    ? "No disponible"
                    : "Accesibles con tu cuenta"}
                </small>
              </div>
            </article>

            <article className="ac-overview-card">
              <div className="ac-overview-icon ac-overview-icon-blue">
                <ShieldCheck size={23} />
              </div>

              <div className="ac-overview-copy">
                <span>Tu espacio</span>
                <strong className="ac-overview-word">
                  Protegido
                </strong>
                <small>
                  Acceso según tus permisos
                </small>
              </div>
            </article>

            <article className="ac-overview-card">
              <div className="ac-overview-icon ac-overview-icon-amber">
                <CheckCircle2 size={23} />
              </div>

              <div className="ac-overview-copy">
                <span>Estado de la consulta</span>
                <strong className="ac-overview-word">
                  {loading
                    ? "Cargando"
                    : error
                      ? "Error"
                      : "Actualizada"}
                </strong>
                <small>
                  {error
                    ? "Revisa el detalle abajo"
                    : "Datos de condominios"}
                </small>
              </div>
            </article>
          </section>

          {/* SECCIÓN DESTACADA */}
          <section
            className="ac-hero"
            aria-label="Acceso a condominios"
          >
            <div>
              <span className="ac-hero-kicker">
                TU COMUNIDAD, MÁS CERCA
              </span>

              <h2>
                Todo lo importante, en un mismo lugar.
              </h2>

              <p>
                Consulta los condominios que tienes asignados
                y accede a sus detalles de forma sencilla.
              </p>

              <a
                className="ac-hero-button"
                href="#mis-condominios"
              >
                Explorar condominios
                <ArrowRight size={17} />
              </a>
            </div>

            <div className="ac-hero-art" aria-hidden="true">
              <span className="ac-art-building ac-art-building-back" />
              <span className="ac-art-building ac-art-building-front" />
              <span className="ac-art-leaf" />
            </div>
          </section>

          {/* LISTADO DE CONDOMINIOS */}
          <section
            className="section"
            id="mis-condominios"
          >
            <div className="section-heading section-heading-row">
              <div>
                <span className="ac-section-eyebrow">
                  TU PORTAFOLIO
                </span>

                <h2>Mis condominios</h2>

                <p>
                  Visualiza los espacios a los que tienes
                  acceso actualmente.
                </p>
              </div>

              <button
                type="button"
                className="refresh-button"
                disabled={loading}
                onClick={handleRefresh}
              >
                <RefreshCw
                  size={16}
                  className={loading ? "spin" : ""}
                />
                Actualizar
              </button>
            </div>

            {loading ? (
              <div className="data-state" role="status">
                <LoaderCircle
                  className="spin"
                  size={27}
                />
                <h3>Cargando condominios...</h3>
                <p>
                  Consultando los datos autorizados
                  de tu cuenta.
                </p>
              </div>
            ) : error ? (
              <div
                className="data-state error-state"
                role="alert"
              >
                <AlertCircle size={27} />
                <h3>
                  No se pudieron obtener los condominios
                </h3>
                <p>{error}</p>

                <button
                  type="button"
                  className="refresh-button"
                  onClick={handleRefresh}
                >
                  Reintentar
                </button>
              </div>
            ) : availableCount === 0 ? (
              <div className="data-state">
                <Building2 size={31} />

                <h3>
                  Aún no tienes condominios asignados
                </h3>

                <p>
                  Cuando tengas una membresía activa en un
                  condominio, aparecerá aquí.
                </p>
              </div>
            ) : (
              <>
                <p className="result-count">
                  {availableCount}{" "}
                  {availableCount === 1
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
                          {condo.direccion ||
                            "Dirección no registrada"}
                        </span>
                      </p>

                      <Link
                        className="condominium-link"
                        to={`/condominiums/${encodeURIComponent(
                          condo.id
                        )}`}
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

          {/* MÓDULOS PENDIENTES */}
          <section className="section ac-upcoming">
            <div className="section-heading">
              <span className="ac-section-eyebrow">
                PRÓXIMAMENTE
              </span>

              <h2>
                Más herramientas para tu comunidad
              </h2>

              <p>
                Estas interfaces se incorporarán
                progresivamente.
              </p>
            </div>

            <div className="modules-grid">
              {modules.map(
                ({ title, description, icon: Icon }) => (
                  <article
                    className="module-card"
                    key={title}
                  >
                    <span className="module-icon">
                      <Icon size={22} />
                    </span>

                    <h3>{title}</h3>
                    <p>{description}</p>

                    <span className="module-status">
                      Interfaz pendiente
                    </span>
                  </article>
                )
              )}
            </div>
          </section>

          {/* PIE DE PÁGINA */}
          <footer className="ac-dashboard-footer">
            AdminCond V1
            <span>·</span>
            Administración de condominios
          </footer>
        </main>
      </div>
    </div>
  );

}
