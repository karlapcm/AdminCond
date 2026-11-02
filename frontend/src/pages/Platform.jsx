import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import V1Layout from '../components/V1Layout';
import ActionForm from '../components/ActionForm';
export default function Platform() {
  const {
    request
  } = useAuth();
  const [state, setState] = useState(null),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    request('/api/v1/profile').then(async p => {
      const data = p.superAdmin ? await request('/api/v1/affiliations') : null;
      if (active) setState({
        allowed: p.superAdmin,
        requests: data?.solicitudes || []
      });
    }).catch(e => {
      if (active) setState({
        error: e.message
      });
    });
    return () => {
      active = false;
    };
  }, [request, revision]);
  return <V1Layout title="Afiliaciones" subtitle="Reviso cada solicitud antes de habilitar una nueva comunidad.">{!state ? <p role="status">Consultando acceso…</p> : state.error ? <p role="alert">{state.error}</p> : !state.allowed ? <p className="v1-empty">Esta sección está disponible para la administración de la plataforma.</p> : <div className="v1-grid"><section className="v1-card"><h2>Solicitudes recibidas</h2>{!state.requests.length ? <p>No hay solicitudes por revisar.</p> : state.requests.map(s => <article key={s.id} className="v1-row"><span className="v1-badge">{s.estado}</span><h3>{s.condominio}</h3><p>{s.nombre} · {s.correo}<br />{s.cliente}<br />{s.direccion}</p>{s.estado === 'pendiente' && <ActionForm title="Revisar solicitud" fields={[{
            name: 'decision',
            label: 'Decisión',
            options: [{
              value: 'aprobar',
              label: 'Aprobar y crear espacio'
            }, {
              value: 'rechazar',
              label: 'Rechazar'
            }]
          }, {
            name: 'motivo',
            label: 'Observación',
            maxLength: 500,
            required: false
          }]} onSubmit={async body => {
            const r = await request(`/api/v1/affiliations/${s.id}/review`, {
              method: 'POST',
              body: body.motivo ? body : {
                decision: body.decision
              }
            });
            setRevision(v => v + 1);
            return r;
          }} />}</article>)}</section><ActionForm title="Crear e invitar una cuenta" submit="Crear cuenta" fields={[{
        name: 'nombre',
        label: 'Nombre',
        maxLength: 120
      }, {
        name: 'correo',
        label: 'Correo del contacto',
        type: 'email',
        maxLength: 254
      }]} onSubmit={body => request('/api/v1/accounts', {
        method: 'POST',
        body
      })}><p>Primero creo la cuenta del contacto. Recibirá instrucciones para elegir su contraseña; después puedo aprobar su afiliación.</p></ActionForm></div>}</V1Layout>;
}
