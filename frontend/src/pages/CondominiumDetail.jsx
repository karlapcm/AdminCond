
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarDays,
  LoaderCircle,
  MapPin,
  ShieldCheck,
} from "lucide-react";

import { useAuth } from "../context/useAuth";
import { getCondominiumById } from "../services/condominiums";

export default function CondominiumDetail() {
  const { condominioId } = useParams();
  const { request } = useAuth();

  const [condominium, setCondominium] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDetail() {
      try {
        const result = await getCondominiumById(
          request,
          condominioId
        );

        if (active) {
          setCondominium(result);
        }
      } catch (err) {
        if (active) {
          setError(
            err.status === 404 || err.status === 403
              ? "No se encontró el condominio o no tienes acceso."
              : err.message
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDetail();

    return () => {
      active = false;
    };
  }, [condominioId, request]);

  function formatDate(dateValue) {
    if (!dateValue) return "No disponible";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "No disponible";
    }

    return new Intl.DateTimeFormat("es-PE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(date);
  }

  return (
    <div className="detail-layout">
      <header className="detail-header">
        <Link to="/dashboard" className="detail-brand">
          <Building2 size={25} />
          <span>AdminCond</span>
        </Link>

        <Link to="/dashboard" className="back-link">
          <ArrowLeft size={18} />
          Volver al dashboard
        </Link>
      </header>

      <main className="detail-content">
        {loading ? (
          <div className="data-state" role="status">
            <LoaderCircle className="spin" size={28} />
            <h2>Cargando condominio...</h2>
            <p>Consultando la información autorizada.</p>
          </div>
        ) : error ? (
          <div className="data-state error-state" role="alert">
            <AlertCircle size={28} />
            <h2>No se pudo abrir el condominio</h2>
            <p>{error}</p>
            <Link to="/dashboard" className="primary-link">
              Volver al dashboard
            </Link>
          </div>
        ) : condominium ? (
          <>
            <span className="section-kicker">
              DETALLE DEL CONDOMINIO
            </span>

            <div className="detail-title-row">
              <div>
                <h1>{condominium.nombre}</h1>
                <p>
                  Información consultada desde nuestra API Express.
                </p>
              </div>

              <span className="condominium-status">
                {condominium.estado}
              </span>
            </div>

            <section className="detail-card">
              <h2>Información general</h2>

              <div className="detail-grid">
                <div className="detail-field">
                  <Building2 size={20} />
                  <div>
                    <span>Nombre</span>
                    <strong>{condominium.nombre}</strong>
                  </div>
                </div>

                <div className="detail-field">
                  <MapPin size={20} />
                  <div>
                    <span>Dirección</span>
                    <strong>
                      {condominium.direccion ||
                        "Dirección no registrada"}
                    </strong>
                  </div>
                </div>

                <div className="detail-field">
                  <ShieldCheck size={20} />
                  <div>
                    <span>Estado</span>
                    <strong>{condominium.estado}</strong>
                  </div>
                </div>

                <div className="detail-field">
                  <CalendarDays size={20} />
                  <div>
                    <span>Fecha de creación</span>
                    <strong>
                      {formatDate(condominium.creado_en)}
                    </strong>
                  </div>
                </div>
              </div>
            </section>

            <div className="detail-info">
              Esta pantalla muestra únicamente información de consulta.
              La gestión de unidades, residentes y finanzas se añadirá
              en las siguientes etapas.
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
