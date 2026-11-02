import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import V1Layout from '../components/V1Layout';
import ActionForm from '../components/ActionForm';
import { apiRequest } from '../services/api';
export default function Community() {
  const [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    apiRequest('/api/v1/publications').then(r => {
      if (active) setResult(r);
    }).catch(e => {
      if (active) setResult({
        error: e.message
      });
    });
    return () => {
      active = false;
    };
  }, []);
  return <V1Layout publicPage title="Una comunidad bien cuidada empieza aquí." subtitle="Un espacio para organizar tu condominio y estar cerca de lo que importa."><section className="v1-hero"><h2>Menos pendientes. Más tranquilidad.</h2><p>Cuotas claras, documentos a mano y comunicación con tu comunidad.</p><Link className="v1-button" to="/login">Entrar a mi espacio →</Link></section><div className="v1-grid"><section className="v1-card"><h2>Noticias de nuestras comunidades</h2>{!result ? <p role="status">Cargando publicaciones…</p> : result.error ? <p role="alert">{result.error}</p> : result.publicaciones.length ? result.publicaciones.map(p => <article className="v1-row" key={p.id}><span className="v1-badge">{p.condominio}</span><h3>{p.titulo}</h3><p>{p.contenido}</p></article>) : <p className="v1-empty">Pronto compartiremos novedades públicas de nuestras comunidades.</p>}</section><ActionForm title="Quiero afiliar mi condominio" submit="Enviar solicitud" fields={[{
        name: 'nombre',
        label: 'Mi nombre',
        maxLength: 120
      }, {
        name: 'correo',
        label: 'Correo de contacto',
        type: 'email',
        maxLength: 254
      }, {
        name: 'cliente',
        label: 'Empresa o particular responsable'
      }, {
        name: 'condominio',
        label: 'Nombre del condominio'
      }, {
        name: 'direccion',
        label: 'Dirección',
        maxLength: 250
      }]} onSubmit={body => apiRequest('/api/v1/affiliations', {
        method: 'POST',
        body
      })}><p>Revisaremos tu solicitud antes de habilitar un espacio privado.</p></ActionForm></div></V1Layout>;
}
