import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useCondominiumContext } from '../context/useCondominiumContext';
import ContextSelector from '../components/ContextSelector';
import CondominiumUnits from '../components/CondominiumUnits';
import V1Layout from '../components/V1Layout';
import ActionForm from '../components/ActionForm';
import InvitationDelivery from '../components/InvitationDelivery';
const opts = values => values.map(value => ({
  value,
  label: value.replaceAll('_', ' ')
}));
function UnitSelect({
  units
}) {
  return units.map(u => ({
    value: String(u.id),
    label: u.codigo
  }));
}
const money = value => new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(Number(value));
const calendarDate = value => new Date(String(value).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-PE');
const date = value => new Date(value).toLocaleString('es-PE');
async function download(request, path, name) {
  const blob = await request(path, {
    responseType: 'blob'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Space({
  id,
  tab
}) {
  const {
    request
  } = useAuth();
  const {
    refreshCondominiums
  } = useCondominiumContext();
  const [result, setResult] = useState(null),
    [revision, setRevision] = useState(0),
    [notice, setNotice] = useState(''),
    [actionBusy,setActionBusy]=useState(false);
  const base = `/api/v1/condominiums/${encodeURIComponent(id)}`;
  useEffect(() => {
    let active = true;
    Promise.all([request(`${base}/workspace`), tab === 'finanzas' ? request(`${base}/fees`) : Promise.resolve({
      cuotas: []
    }), request('/api/units/mine')]).then(async ([space, finance, mine]) => {
      let units = mine.unidades.filter(u => String(u.condominio_id) === String(id));
      if (space.admin || space.supercliente) units = (await request(`/api/units/condominium/${id}`)).unidades;
      const ownUnits = mine.unidades.filter(u => String(u.condominio_id) === String(id));
      let people = [];
      if (space.admin && tab === 'residentes') people = await Promise.all(units.map(async u => ({
        unit: u,
        ...(await request(`/api/units/${u.id}/people`))
      })));
      const audit = space.admin && tab === 'seguridad' ? await request(`${base}/audit`) : {
        eventos: []
      };
      if (active) setResult({
        space,
        fees: finance.cuotas,
        units,
        ownUnits,
        people,
        audit: audit.eventos
      });
    }).catch(e => {
      if (active) setResult({
        error: e.message
      });
    });
    return () => {
      active = false;
    };
  }, [request, id, base, revision, tab]);
  async function mutate(path, body, method = 'POST') {
    const r = await request(path, {
      method,
      body
    });
    setRevision(v => v + 1);
    if (path.endsWith('/siblings') || path.endsWith('/settings')) refreshCondominiums();
    return r;
  }
  async function action(fn) {
    if(actionBusy)return;
    setNotice('');
    setActionBusy(true);
    try {
      if(await fn()===false)return;
      setNotice({text:'Listo. La información está actualizada.',error:false});
      setRevision(v => v + 1);
    } catch (e) {
      setNotice({text:e.message,error:true});
    }finally{setActionBusy(false);}
  }
  if (!result) return <p role="status">Preparando tu espacio…</p>;
  if (result.error) return <section className="v1-card"><p role="alert">{result.error}</p><button className="v1-button" onClick={() => setRevision(v => v + 1)}>Reintentar</button></section>;
  const {
    space,
    fees,
    units,
    ownUnits,
    people,
    audit
  } = result;
  const unitOptions = UnitSelect({
    units
  });
  return <>{notice && <p className={notice.error?'form-error':'v1-success'} role={notice.error?'alert':'status'}>{notice.text}</p>}
 {tab === 'seguridad' && space.supercliente && <div className="v1-grid"><ActionForm title="Invitar cuenta de administración" fields={[{
        name: 'nombre',
        label: 'Nombre',
        maxLength: 120
      }, {
        name: 'correo',
        label: 'Correo',
        type: 'email',
        maxLength: 254
      }]} onSubmit={d => mutate('/api/v1/accounts', {
        ...d,
        condominioId: id
      })} /><ActionForm title="Agregar otro condominio a mi cliente" fields={[{
        name: 'nombre',
        label: 'Nombre del condominio'
      }, {
        name: 'direccion',
        label: 'Dirección',
        maxLength: 250
      }]} onSubmit={d => mutate(`${base}/siblings`, d)}><p>El nuevo condominio aparecerá cuando se apruebe su afiliación.</p></ActionForm><ActionForm title="Actualizar datos de mi cliente y condominio" fields={[{
        name: 'cliente',
        label: 'Nombre del cliente'
      }, {
        name: 'nombre',
        label: 'Nombre del condominio'
      }, {
        name: 'direccion',
        label: 'Dirección',
        maxLength: 250
      }]} onSubmit={d => mutate(`${base}/settings`, d, 'PATCH')} /></div>}
 {tab === 'residentes' && <><CondominiumUnits key={`${id}-${revision}`} condominiumId={id} />{space.admin && <InvitationDelivery condominiumId={id} />} {space.admin && <div className="v1-grid">
  <ActionForm title="Nuevo edificio o torre" fields={[{
          name: 'nombre',
          label: 'Nombre',
          maxLength: 120
        }]} onSubmit={d => mutate(`${base}/buildings`, d)} />
  <ActionForm title="Nueva vivienda" fields={[{
          name: 'codigo',
          label: 'Código de vivienda',
          maxLength: 50
        }, {
          name: 'tipo',
          label: 'Tipo',
          options: opts(['departamento', 'casa', 'otro'])
        }, {
          name: 'edificioId',
          label: 'Edificio (opcional)',
          required: false,
          options: space.edificios.map(e => ({
            value: e.id,
            label: e.nombre
          }))
        }, {
          name: 'piso',
          label: 'Piso (opcional)',
          maxLength: 30,
          required: false
        }]} onSubmit={d => mutate(`${base}/units`, {
          ...d,
          edificioId: d.edificioId || null,
          ...(!d.piso ? {
            piso: undefined
          } : {})
        })} />
  <ActionForm title="Crear e invitar una cuenta" fields={[{
          name: 'nombre',
          label: 'Nombre',
          maxLength: 120
        }, {
          name: 'correo',
          label: 'Correo electrónico',
          type: 'email',
          maxLength: 254
        }]} onSubmit={d => mutate('/api/v1/accounts', {
          ...d,
          condominioId: id
        })} />
  <ActionForm title="Vincular una persona a su vivienda" fields={[{
          name: 'unidadId',
          label: 'Vivienda',
          options: unitOptions
        }, {
          name: 'correo',
          label: 'Correo de la cuenta',
          type: 'email',
          maxLength: 254
        }, ...['esPropietario', 'esInquilino', 'esOcupante', 'esPrincipal', 'responsablePago', 'accesoFinanciero'].map((name, i) => ({
          name,
          label: ['Propietario', 'Inquilino', 'Ocupante', 'Responsable principal', 'Responsable de pago', 'Permitir consulta financiera y registro de pagos'][i],
          type: 'checkbox'
        }))]} onSubmit={d => mutate(`${base}/people`, d)} />
  <section className="v1-card"><h2>Cambios de residencia</h2><p>Al retirar el acceso conservo el historial de la vivienda.</p>{people.map(p => <div key={p.unit.id} className="v1-row"><h3>{p.unit.codigo}</h3>{p.personas.map(person => <div className="v1-actions" key={person.id}><span>{person.nombre}</span><button className="v1-button" disabled={actionBusy} onClick={() => action(() => {
                if (!window.confirm(`¿Retirar el acceso de ${person.nombre} a ${p.unit.codigo}?`)) return false;
                return request(`${base}/people/${person.relacion_id}/revoke`, {
                  method: 'POST',
                  body: {
                    confirmar: true
                  }
                });
              })}>Retirar acceso</button></div>)}</div>)}</section>
 </div>}<p><Link to="/invitations">Solicitudes e invitaciones de residentes →</Link></p></>}
 {tab === 'finanzas' && <div className="v1-grid"><section className="v1-card"><h2>Cuotas y saldos</h2>{!fees.length ? <p className="v1-empty">No hay cuotas disponibles para tus permisos.</p> : fees.map(q => <article key={q.id} className="v1-row"><span className="v1-badge">{q.estado}</span><h3>{q.concepto} · {q.unidad}</h3><p>Monto: {money(q.monto)} · Saldo: {money(q.saldo)}<br />Vence: {calendarDate(q.vencimiento)}</p>{q.pagos.map(p => <div className="v1-row" key={p.id}><p>Pago {p.id}: {money(p.monto)} · {p.estado}<br />{p.referencia}</p>{p.comprobantes.map(c => <button key={c.id} className="v1-button" disabled={actionBusy} onClick={() => action(() => download(request, `/api/finance/receipts/${c.id}`, c.nombre))}>Descargar comprobante</button>)}{p.estado === 'pendiente' && !p.puede_adjuntar && space.permisos.includes('revisar_pagos') && <div className="v1-actions">{['aprobar', 'rechazar'].map(decision => <button key={decision} className="v1-button" disabled={actionBusy} onClick={() => action(() => {
                if (!window.confirm(`¿${decision === 'aprobar' ? 'Aprobar' : 'Rechazar'} este pago?`)) return false;
                return request(`/api/finance/payments/${p.id}/review`, {
                  method: 'POST',
                  body: {
                    decision
                  }
                });
              })}>{decision === 'aprobar' ? 'Aprobar' : 'Rechazar'}</button>)}</div>}</div>)}</article>)}</section><div>
 {space.permisos.includes('crear_cuotas') && <ActionForm title="Emitir cuota" fields={[{
          name: 'unidadId',
          label: 'Vivienda',
          options: unitOptions
        }, {
          name: 'concepto',
          label: 'Concepto',
          maxLength: 200,
          minLength: 3
        }, {
          name: 'periodo',
          label: 'Periodo',
          type: 'date'
        }, {
          name: 'monto',
          label: 'Monto',
          type: 'number',
          min: '.01',
          step: '.01'
        }, {
          name: 'vencimiento',
          label: 'Vencimiento',
          type: 'date'
        }]} onSubmit={d => mutate('/api/finance/fees', {
          ...d,
          monto: Number(d.monto).toFixed(2)
        })} />}<ActionForm title="Registrar pago manual" submit="Registrar pago" fields={[{
          name: 'cuotaId',
          label: 'Cuota',
          options: fees.filter(q => ownUnits.some(u => String(u.id) === String(q.unidad_id)) && Number(q.saldo) > 0).map(q => ({
            value: q.id,
            label: `${q.unidad} · ${q.concepto}`
          }))
        }, {
          name: 'monto',
          label: 'Monto abonado',
          type: 'number',
          min: '.01',
          step: '.01'
        }, {
          name: 'referencia',
          label: 'Referencia (opcional)',
          required: false
        }]} onSubmit={d => mutate('/api/finance/payments', {
          ...d,
          monto: Number(d.monto).toFixed(2)
        })}><p>El saldo cambia cuando una persona autorizada valida el pago.</p></ActionForm><ActionForm title="Adjuntar comprobante" fields={[{
          name: 'pagoId',
          label: 'Mi pago pendiente',
          options: fees.flatMap(q=>q.pagos.filter(p=>p.puede_adjuntar).map(p=>({value:p.id,label:`${q.unidad} · ${q.concepto} · ${money(p.monto)}`})))
        }, {
          name: 'archivo',
          label: 'Comprobante (PDF, JPG o PNG; máximo 5 MB)',
          type: 'file',
          accept: '.pdf,.jpg,.jpeg,.png'
        }]} onSubmit={d => {
          if (d.archivo.size > 5242880) throw new Error('El archivo supera 5 MB.');
          const body = new FormData();
          body.append('comprobante', d.archivo);
          return mutate(`/api/finance/receipts/payments/${encodeURIComponent(d.pagoId)}`, body);
        }} />
 </div></div>}
 {tab === 'documentos' && <div className="v1-grid"><section className="v1-card"><h2>Documentos de mi comunidad</h2>{space.documentos.length ? space.documentos.map(d => <article className="v1-row" key={d.id}><h3>{d.titulo}</h3><button className="v1-button" disabled={actionBusy} onClick={() => action(() => download(request, `${base}/documents/${d.id}`, d.nombre))}>Descargar {d.nombre}</button></article>) : <p className="v1-empty">Aún no hay documentos compartidos.</p>}<h2>Juntas de propietarios</h2>{space.juntas.length ? space.juntas.map(j => <article className="v1-row" key={j.id}><h3>{j.titulo}</h3><small>{date(j.fecha)}</small><p>{j.contenido}</p></article>) : <p className="v1-empty">Aún no hay juntas publicadas.</p>}</section>{space.admin && <div><ActionForm title="Compartir documento privado" fields={[{
          name: 'titulo',
          label: 'Título'
        }, {
          name: 'archivo',
          label: 'Archivo (PDF, JPG o PNG; máximo 5 MB)',
          type: 'file',
          accept: '.pdf,.jpg,.jpeg,.png'
        }]} onSubmit={d => {
          if (d.archivo.size > 5242880) throw new Error('El archivo supera 5 MB.');
          const body = new FormData();
          body.append('titulo', d.titulo);
          body.append('archivo', d.archivo);
          return mutate(`${base}/documents`, body);
        }} /><ActionForm title="Publicar junta" fields={[{
          name: 'titulo',
          label: 'Título'
        }, {
          name: 'contenido',
          label: 'Agenda e información',
          type: 'textarea'
        }, {
          name: 'fecha',
          label: 'Fecha y hora local',
          type: 'datetime-local'
        }]} onSubmit={d => mutate(`${base}/juntas`, {
          ...d,
          fecha: new Date(d.fecha).toISOString()
        })} /><ActionForm title="Publicación para visitantes" fields={[{
          name: 'titulo',
          label: 'Título'
        }, {
          name: 'contenido',
          label: 'Contenido público',
          type: 'textarea'
        }]} onSubmit={d => mutate(`${base}/publications`, d)}><p>Esta publicación será visible sin iniciar sesión. Evita incluir datos privados de residentes.</p></ActionForm></div>}</div>}
 {tab === 'areas' && <div className="v1-grid">{!space.areas.length && <p className="v1-empty">Este condominio todavía no tiene áreas comunes.</p>}{space.areas.map(a => <section key={a.id} className="v1-card"><span className="v1-badge">{a.estado === 'activa' ? 'Disponible' : 'Cerrada'}</span><h2>{a.nombre}</h2><p>{a.descripcion}</p><p>{a.horario || 'Consulta el horario con la administración.'}<br />{a.normas}</p>{a.motivo_cierre && <p>Motivo del cierre: {a.motivo_cierre}</p>}{space.admin && <ActionForm title="Disponibilidad y reglas" fields={[{
          name: 'estado',
          label: 'Disponibilidad',
          defaultValue: a.estado,
          options: [{
            value: 'activa',
            label: 'Disponible'
          }, {
            value: 'inactiva',
            label: 'Cerrada'
          }]
        }, {
          name: 'motivo',
          label: 'Motivo (obligatorio al cerrar)',
          maxLength: 500,
          required: false,
          defaultValue: a.motivo_cierre || ''
        }, {
          name: 'horario',
          label: 'Horarios',
          maxLength: 500,
          required: false,
          defaultValue: a.horario
        }, {
          name: 'normas',
          label: 'Normas de uso',
          type: 'textarea',
          maxLength: 2000,
          required: false,
          defaultValue: a.normas
        }]} onSubmit={d => mutate(`${base}/areas/${a.id}`, {
          ...d,
          motivo: d.motivo || undefined
        }, 'PATCH')} />}</section>)}{space.admin && <ActionForm title="Agregar área común" fields={[{
        name: 'nombre',
        label: 'Nombre',
        maxLength: 120
      }, {
        name: 'descripcion',
        label: 'Descripción',
        maxLength: 500,
        required: false
      }, {
        name: 'capacidad',
        label: 'Capacidad (opcional)',
        type: 'number',
        min: 1,
        required: false
      }]} onSubmit={d => mutate('/api/reservations/areas', {
        condominioId: id,
        nombre: d.nombre,
        descripcion: d.descripcion || undefined,
        capacidad: d.capacidad ? Number(d.capacidad) : undefined
      })} />}<p><Link to="/reservations">Abrir agenda de reservas →</Link></p></div>}
 {tab === 'seguridad' && <div className="v1-grid">{space.supercliente && <><ActionForm title="Asignar administrador" fields={[{
          name: 'correo',
          label: 'Correo de una cuenta existente',
          type: 'email',
          maxLength: 254
        }]} onSubmit={d => mutate(`${base}/administrators`, d)} /><ActionForm title="Permisos financieros" fields={[{
          name: 'correo',
          label: 'Correo de la persona',
          type: 'email',
          maxLength: 254
        }, {
          name: 'permiso',
          label: 'Permiso',
          options: opts(['crear_cuotas', 'revisar_pagos'])
        }, {
          name: 'estado',
          label: 'Acceso',
          options: [{
            value: 'activo',
            label: 'Conceder'
          }, {
            value: 'revocado',
            label: 'Revocar'
          }]
        }]} onSubmit={d => mutate(`${base}/financial-permissions`, d)}><p>Administrar el condominio no concede permisos financieros automáticamente.</p></ActionForm></>}{space.admin ? <section className="v1-card"><h2>Registro de actividad</h2><div className="v1-scroll"><table className="v1-table"><thead><tr><th>Fecha</th><th>Sección</th><th>Cambio</th><th>Cuenta</th></tr></thead><tbody>{audit.map(a => <tr key={a.id}><td>{date(a.creada_en)}</td><td>{a.tabla}</td><td>{a.accion === 'INSERT' ? 'Alta' : a.accion === 'UPDATE' ? 'Actualización' : 'Retiro'} #{a.registro_id}</td><td>{a.usuario_id || 'Sin atribución'}</td></tr>)}</tbody></table></div>{!audit.length && <p>Aún no hay actividad registrada.</p>}</section> : <section className="v1-card"><h2>Mi acceso</h2><p>Mis permisos se comprueban en cada operación. Los documentos y datos de otras comunidades permanecen privados.</p><Link to="/recover-access">Cambiar mi contraseña de forma segura</Link></section>}</div>}
 </>;
}
export default function Workspace() {
  const {
    selectedCondominiumId,
    contextLoading,
    contextError,
    condominiumsLoading
  } = useCondominiumContext();
  const [params] = useSearchParams();
  const tabs = [['residentes', 'Unidades y residentes'], ['finanzas', 'Cuotas y pagos'], ['documentos', 'Documentos y juntas'], ['areas', 'Áreas comunes'], ['seguridad', 'Accesos y actividad']];
  const tab = tabs.some(t => t[0] === params.get('tab')) ? params.get('tab') : 'residentes';
  return <V1Layout title="Mi condominio" subtitle="Organiza tus espacios, consulta tus obligaciones y mantente cerca de tu comunidad."><ContextSelector /><nav className="v1-tabs" aria-label="Secciones del condominio">{tabs.map(([key, label]) => <Link key={key} to={`/workspace?tab=${key}`} aria-current={tab === key ? 'page' : undefined}>{label}</Link>)}</nav>{contextError ? <p role="alert">{contextError}</p> : contextLoading || condominiumsLoading ? <p role="status">Consultando mis permisos…</p> : selectedCondominiumId ? <Space key={`${selectedCondominiumId}-${tab}`} id={selectedCondominiumId} tab={tab} /> : <p className="v1-empty">Cuando tengas un condominio asignado, aparecerá aquí.</p>}</V1Layout>;
}
