import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { pool } from '../../database/pool.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { createAccessRecovery } from '../auth/auth.recovery.js';
import { sendAccessRecoveryEmail } from '../auth/auth.recovery.mailer.js';
export const v1Router = Router();
const id = z.coerce.number().int().positive().safe();
const text = max => z.string().trim().min(1).max(max);
const email = z.string().trim().email().max(254).transform(s => s.toLowerCase());
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
function fail(status, message) {
  throw Object.assign(new Error(message), {
    status
  });
}
function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) fail(400, 'Revisa los datos del formulario');
  return result.data;
}
async function transaction(userId, fn) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const account = await db.query("SELECT id FROM admincond.usuarios WHERE id=$1 AND estado='activo' FOR SHARE", [userId]);
    if (!account.rowCount) fail(401, 'La cuenta ya no tiene acceso');
    await db.query("SELECT set_config('admincond.actor',$1,true)", [String(userId)]);
    const result = await fn(db);
    await db.query('COMMIT');
    return result;
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  } finally {
    db.release();
  }
}
async function platform(db, userId) {
  const r = await db.query("SELECT admincond.bloquear_admin_plataforma($1) AS permitido", [userId]);
  if (!r.rows[0].permitido) fail(403, 'No tienes permiso para administrar la plataforma');
}
// Bloquear las membresías conserva la autorización hasta terminar la escritura.
async function scope(db, userId, condoId, mode = 'read') {
  const lock = mode === 'client' ? 'UPDATE' : 'SHARE';
  const co = await db.query(`SELECT co.id,co.cliente_id FROM admincond.condominios co JOIN admincond.clientes c ON c.id=co.cliente_id
 WHERE co.id=$1 AND co.estado='activo' AND c.estado='activo' FOR ${lock} OF co,c`, [condoId]);
  if (!co.rowCount) fail(404, 'Condominio no encontrado');
  const client = await db.query("SELECT rol FROM admincond.membresias_cliente WHERE usuario_id=$1 AND cliente_id=$2 AND estado='activo' FOR SHARE", [userId, co.rows[0].cliente_id]);
  const membership = await db.query("SELECT rol FROM admincond.membresias_condominio WHERE usuario_id=$1 AND condominio_id=$2 AND estado='activo' FOR SHARE", [userId, condoId]);
  const superclient = client.rows[0]?.rol === 'supercliente';
  const admin = membership.rows[0]?.rol === 'administrador';
  if (!client.rowCount || !membership.rowCount && !superclient || mode === 'admin' && !admin || mode === 'client' && !superclient || mode === 'manage' && !admin && !superclient) fail(404, 'Condominio no encontrado o sin permiso');
  return {
    ...co.rows[0],
    admin,
    superclient
  };
}
async function scoped(req, mode, fn) {
  const condoId = parse(id, req.params.condoId);
  return transaction(req.user.id, async db => fn(db, await scope(db, req.user.id, condoId, mode), condoId));
}
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    message: 'Demasiadas solicitudes. Intenta más tarde.'
  }
});
v1Router.get('/publications', wrap(async (_req, res) => {
  const r = await pool.query(`SELECT p.id,p.titulo,p.contenido,p.creada_en,co.nombre AS condominio FROM admincond.publicaciones_publicas p
 JOIN admincond.condominios co ON co.id=p.condominio_id JOIN admincond.clientes c ON c.id=co.cliente_id
 WHERE co.estado='activo' AND c.estado='activo' ORDER BY p.id DESC LIMIT 100`);
  res.json({
    publicaciones: r.rows
  });
}));
v1Router.post('/affiliations', publicLimiter, wrap(async (req, res) => {
  const d = parse(z.object({
    nombre: text(120),
    correo: email,
    cliente: text(150),
    condominio: text(150),
    direccion: text(250)
  }), req.body);
  await pool.query(`INSERT INTO admincond.solicitudes_afiliacion(nombre,correo,cliente,condominio,direccion) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, Object.values(d));
  res.status(202).json({
    message: 'Recibimos tu solicitud. Revisaremos la información para contactarte.'
  });
}));
v1Router.use(requireAuth);
v1Router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' && process.env.DB_NAME === 'admincond_test' ? 1000 : 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    message: 'Demasiadas solicitudes. Intenta más tarde.'
  }
}));
v1Router.get('/profile', wrap(async (req, res) => {
  const r = await pool.query("SELECT 1 FROM admincond.administradores_plataforma WHERE usuario_id=$1 AND estado='activo'", [req.user.id]);
  res.json({
    superAdmin: r.rowCount === 1
  });
}));
v1Router.get('/condominiums/:condoId/fees', wrap(async (req, res) => {
  const rows = await scoped(req, 'read', async (db, _s, c) => {
    return (await db.query(`SELECT q.id,q.unidad_id,u.codigo AS unidad,q.concepto,q.periodo,q.monto,q.vencimiento,q.estado,
   q.monto-COALESCE((SELECT SUM(p.monto) FROM admincond.pagos p WHERE p.cuota_id=q.id AND p.estado='aprobado'),0) AS saldo,
   COALESCE((SELECT json_agg(json_build_object('id',p.id,'monto',p.monto,'estado',p.estado,'referencia',p.referencia,
   'puede_adjuntar',p.registrado_por=$1 AND p.estado='pendiente','comprobantes',
   (SELECT COALESCE(json_agg(json_build_object('id',cp.id,'nombre',cp.nombre_original)),'[]') FROM admincond.comprobantes cp WHERE cp.pago_id=p.id
    AND (p.registrado_por=$1 OR EXISTS(SELECT 1 FROM admincond.permisos_financieros pf JOIN admincond.membresias_condominio m ON m.usuario_id=pf.usuario_id AND m.condominio_id=pf.condominio_id
    WHERE pf.usuario_id=$1 AND pf.condominio_id=$2 AND pf.permiso='revisar_pagos' AND pf.estado='activo' AND m.estado='activo'))))) FROM admincond.pagos p WHERE p.cuota_id=q.id),'[]') AS pagos
   FROM admincond.cuotas q JOIN admincond.unidades u ON u.id=q.unidad_id WHERE q.condominio_id=$2 AND u.estado='activa' AND (
    EXISTS(SELECT 1 FROM admincond.relaciones_unidad r JOIN admincond.membresias_condominio m ON m.usuario_id=r.usuario_id AND m.condominio_id=r.condominio_id AND m.estado='activo'
     WHERE r.usuario_id=$1 AND r.unidad_id=q.unidad_id AND r.estado='activo' AND (r.es_principal OR r.responsable_pago OR r.acceso_financiero))
    OR EXISTS(SELECT 1 FROM admincond.permisos_financieros pf JOIN admincond.membresias_condominio m ON m.usuario_id=pf.usuario_id AND m.condominio_id=pf.condominio_id AND m.estado='activo'
     WHERE pf.usuario_id=$1 AND pf.condominio_id=$2 AND pf.estado='activo' AND pf.permiso IN ('consultar_finanzas','crear_cuotas','revisar_pagos')))
   ORDER BY q.periodo DESC,q.id DESC`, [req.user.id, c])).rows;
  });
  res.json({
    cuotas: rows
  });
}));
v1Router.get('/affiliations', wrap(async (req, res) => {
  const result = await transaction(req.user.id, async db => {
    await platform(db, req.user.id);
    return (await db.query('SELECT * FROM admincond.solicitudes_afiliacion ORDER BY id DESC LIMIT 200')).rows;
  });
  res.json({
    solicitudes: result
  });
}));
v1Router.post('/affiliations/:requestId/review', wrap(async (req, res) => {
  const requestId = parse(id, req.params.requestId);
  const d = parse(z.object({
    decision: z.enum(['aprobar', 'rechazar']),
    motivo: text(500).optional()
  }), req.body);
  const result = await transaction(req.user.id, async db => {
    await platform(db, req.user.id);
    const r = await db.query("SELECT * FROM admincond.solicitudes_afiliacion WHERE id=$1 AND estado='pendiente' FOR UPDATE", [requestId]);
    if (!r.rowCount) fail(409, 'La solicitud ya fue revisada o no está disponible');
    let condoId = null;
    if (d.decision === 'aprobar') {
      const s = r.rows[0];
      const u = await db.query("SELECT id FROM admincond.usuarios WHERE LOWER(correo)=LOWER($1) AND estado='activo'", [s.correo]);
      if (!u.rowCount) fail(400, 'Primero crea e invita la cuenta del contacto desde Cuentas');
      let clientId=s.cliente_id;
      if(clientId){
        const existing=await db.query("SELECT c.id FROM admincond.clientes c JOIN admincond.membresias_cliente mc ON mc.cliente_id=c.id WHERE c.id=$1 AND mc.usuario_id=$2 AND mc.rol='supercliente' AND mc.estado='activo' AND c.estado='activo' FOR SHARE OF c,mc",[clientId,u.rows[0].id]);
        if(!existing.rowCount)fail(409,'El cliente o la autorización del contacto cambió. Revisa la solicitud.');
      }else{
        const c=await db.query('INSERT INTO admincond.clientes(nombre) VALUES($1) RETURNING id',[s.cliente]);
        clientId=c.rows[0].id;
      }
      const co = await db.query('INSERT INTO admincond.condominios(cliente_id,nombre,direccion) VALUES($1,$2,$3) RETURNING id', [clientId, s.condominio, s.direccion]);
      condoId = co.rows[0].id;
      await db.query("INSERT INTO admincond.membresias_cliente(usuario_id,cliente_id,rol) VALUES($1,$2,'supercliente') ON CONFLICT(usuario_id,cliente_id) DO NOTHING", [u.rows[0].id, clientId]);
      // El supercliente organiza su cliente; los permisos financieros se asignan por separado.
    }
    return (await db.query(`UPDATE admincond.solicitudes_afiliacion SET estado=$2,motivo=$3,revisada_en=NOW(),revisado_por=$4,condominio_id=$5 WHERE id=$1 RETURNING id,estado`, [requestId, d.decision === 'aprobar' ? 'aprobada' : 'rechazada', d.motivo || null, req.user.id, condoId])).rows[0];
  });
  res.json(result);
}));
// Altas de cuentas solo mediante plataforma o administrador autorizado de un condominio.
v1Router.post('/accounts', wrap(async (req, res) => {
  const d = parse(z.object({
    nombre: text(120),
    correo: email,
    condominioId: id.optional()
  }), req.body);
  const result = await transaction(req.user.id, async db => {
    if (d.condominioId) await scope(db, req.user.id, d.condominioId, 'manage');else await platform(db, req.user.id);
    const hash = await argon2.hash(randomBytes(48).toString('base64url'));
    const r = await db.query('INSERT INTO admincond.usuarios(nombre,correo,password_hash) VALUES($1,$2,$3) RETURNING id,nombre,correo', [d.nombre, d.correo, hash]);
    return r.rows[0];
  });
  let entrega = 'no_disponible';
  let recovery;
  try {
    recovery = await createAccessRecovery(result.correo);
    if (recovery) {
      await sendAccessRecoveryEmail({
        to: recovery.to,
        token: recovery.token
      });
      entrega = 'enviada';
    }
  } catch {
    if (recovery) await pool.query('UPDATE admincond.recuperaciones_acceso SET consumido_en=NOW() WHERE id=$1 AND consumido_en IS NULL', [recovery.recoveryId]);
  }
  res.status(201).json({
    cuenta: result,
    entrega,
    message: entrega === 'enviada' ? 'Cuenta creada. Enviamos las instrucciones para elegir contraseña.' : 'Cuenta creada. Configura el correo y solicita recuperación de acceso para activarla.'
  });
}));
v1Router.get('/condominiums/:condoId/workspace', wrap(async (req, res) => {
  const result = await scoped(req, 'read', async (db, s, condoId) => {
    const areas = await db.query('SELECT id,nombre,descripcion,capacidad,estado,normas,horario,motivo_cierre FROM admincond.areas_comunes WHERE condominio_id=$1 ORDER BY nombre', [condoId]);
    const juntas = await db.query('SELECT id,titulo,contenido,fecha FROM admincond.juntas WHERE condominio_id=$1 ORDER BY fecha DESC LIMIT 100', [condoId]);
    const docs = await db.query('SELECT id,titulo,nombre,tipo_mime,creada_en FROM admincond.documentos WHERE condominio_id=$1 ORDER BY id DESC LIMIT 100', [condoId]);
    const buildings = await db.query('SELECT id,nombre FROM admincond.edificios WHERE condominio_id=$1 ORDER BY nombre', [condoId]);
    const permissions = await db.query(`SELECT pf.permiso FROM admincond.permisos_financieros pf JOIN admincond.membresias_condominio m ON m.usuario_id=pf.usuario_id AND m.condominio_id=pf.condominio_id AND m.estado='activo' WHERE pf.usuario_id=$1 AND pf.condominio_id=$2 AND pf.estado='activo'`, [req.user.id, condoId]);
    return {
      admin: s.admin,
      supercliente: s.superclient,
      areas: areas.rows,
      juntas: juntas.rows,
      documentos: docs.rows,
      edificios: buildings.rows,
      permisos: permissions.rows.map(p => p.permiso)
    };
  });
  res.json(result);
}));
v1Router.get('/condominiums/:condoId/invitations', wrap(async (req, res) => {
  const rows = await scoped(req, 'admin', async (db, _s, c) => (await db.query(`SELECT i.id,i.correo_destino,u.codigo AS unidad,i.estado,i.estado_entrega,i.expira_en,
  (i.estado='pendiente' AND s.estado='aprobada' AND u.estado='activa' AND (
   (i.estado_entrega='enviando' AND COALESCE(i.inicio_envio_en,i.creada_en)<=NOW()-INTERVAL '30 minutes')
   OR (i.estado_entrega='pendiente' AND i.recuperacion_iniciada_en<=NOW()-INTERVAL '30 minutes'))) AS puede_recuperar
  FROM admincond.invitaciones i JOIN admincond.solicitudes_residentes s ON s.id=i.solicitud_id
  JOIN admincond.unidades u ON u.id=s.unidad_id AND u.condominio_id=s.condominio_id
  WHERE s.condominio_id=$1 ORDER BY i.id DESC LIMIT 200`, [c])).rows);
  res.json({
    invitaciones: rows
  });
}));
v1Router.post('/condominiums/:condoId/siblings', wrap(async (req, res) => {
  const d = parse(z.object({
    nombre: text(150),
    direccion: text(250)
  }), req.body);
  await scoped(req,'client',async(db,s)=>{
    const client=await db.query('SELECT nombre FROM admincond.clientes WHERE id=$1',[s.cliente_id]);
    await db.query(`INSERT INTO admincond.solicitudes_afiliacion(nombre,correo,cliente,condominio,direccion,cliente_id)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,[req.user.nombre,req.user.correo,client.rows[0].nombre,d.nombre,d.direccion,s.cliente_id]);
  });
  res.status(202).json({message:'Enviamos la solicitud. El nuevo condominio estará disponible cuando se apruebe su afiliación.'});
}));
v1Router.patch('/condominiums/:condoId/settings', wrap(async (req, res) => {
  const d = parse(z.object({
    nombre: text(150),
    direccion: text(250),
    cliente: text(150)
  }), req.body);
  await scoped(req, 'client', async (db, s, c) => {
    await db.query('UPDATE admincond.condominios SET nombre=$2,direccion=$3 WHERE id=$1', [c, d.nombre, d.direccion]);
    await db.query('UPDATE admincond.clientes SET nombre=$2 WHERE id=$1', [s.cliente_id, d.cliente]);
  });
  res.json({
    message: 'Datos de mi comunidad actualizados.'
  });
}));
v1Router.post('/condominiums/:condoId/buildings', wrap(async (req, res) => {
  const d = parse(z.object({
    nombre: text(120)
  }), req.body);
  const r = await scoped(req, 'admin', async (db, _s, c) => (await db.query('INSERT INTO admincond.edificios(condominio_id,nombre) VALUES($1,$2) RETURNING id,nombre', [c, d.nombre])).rows[0]);
  res.status(201).json(r);
}));
v1Router.post('/condominiums/:condoId/units', wrap(async (req, res) => {
  const d = parse(z.object({
    codigo: text(50),
    tipo: z.enum(['departamento', 'casa', 'otro']),
    edificioId: id.nullable().optional(),
    piso: text(30).optional()
  }), req.body);
  const r = await scoped(req, 'admin', async (db, _s, c) => {
    if (d.edificioId && !(await db.query('SELECT 1 FROM admincond.edificios WHERE id=$1 AND condominio_id=$2', [d.edificioId, c])).rowCount) fail(404, 'Edificio no encontrado');
    return (await db.query('INSERT INTO admincond.unidades(condominio_id,codigo,tipo,edificio_id,piso) VALUES($1,$2,$3,$4,$5) RETURNING id,codigo', [c, d.codigo, d.tipo, d.edificioId || null, d.piso || null])).rows[0];
  });
  res.status(201).json(r);
}));
v1Router.post('/condominiums/:condoId/people', wrap(async (req, res) => {
  const d = parse(z.object({
    unidadId: id,
    correo: email,
    esPropietario: z.boolean(),
    esInquilino: z.boolean(),
    esOcupante: z.boolean(),
    esPrincipal: z.boolean(),
    responsablePago: z.boolean(),
    accesoFinanciero: z.boolean().default(false)
  }), req.body);
  if (!d.esPropietario && !d.esInquilino && !d.esOcupante && !d.responsablePago) fail(400, 'Selecciona la relación con la vivienda');
  const r = await scoped(req, 'admin', async (db, s, c) => {
    const un = await db.query("SELECT id FROM admincond.unidades WHERE id=$1 AND condominio_id=$2 AND estado='activa' FOR UPDATE", [d.unidadId, c]);
    const u = await db.query("SELECT id FROM admincond.usuarios WHERE LOWER(correo)=LOWER($1) AND estado='activo'", [d.correo]);
    if (!un.rowCount || !u.rowCount) fail(404, 'Unidad o cuenta no disponible. Crea primero la cuenta.');
    const userId = u.rows[0].id;
    const clientMembership = await db.query("INSERT INTO admincond.membresias_cliente(usuario_id,cliente_id,rol) VALUES($1,$2,'colaborador') ON CONFLICT(usuario_id,cliente_id) DO UPDATE SET estado='activo' WHERE membresias_cliente.rol='colaborador' OR membresias_cliente.estado='activo' RETURNING usuario_id", [userId, s.cliente_id]);
    if (!clientMembership.rowCount) fail(403, 'La reactivación de un Supercliente requiere revisión de la plataforma');
    await db.query("INSERT INTO admincond.membresias_condominio(usuario_id,cliente_id,condominio_id,rol) VALUES($1,$2,$3,'residente') ON CONFLICT(usuario_id,condominio_id) DO UPDATE SET estado='activo'", [userId, s.cliente_id, c]);
    return (await db.query(`INSERT INTO admincond.relaciones_unidad(usuario_id,condominio_id,unidad_id,es_propietario,es_inquilino,es_ocupante,es_principal,responsable_pago,acceso_financiero)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(usuario_id,unidad_id) DO UPDATE SET estado='activo',es_propietario=$4,es_inquilino=$5,es_ocupante=$6,es_principal=$7,responsable_pago=$8,acceso_financiero=$9 RETURNING id`, [userId, c, d.unidadId, d.esPropietario, d.esInquilino, d.esOcupante, d.esPrincipal, d.responsablePago, d.accesoFinanciero])).rows[0];
  });
  res.status(201).json(r);
}));
v1Router.post('/condominiums/:condoId/people/:relationId/revoke', wrap(async (req, res) => {
  const relationId = parse(id, req.params.relationId);
  parse(z.object({
    confirmar: z.literal(true)
  }), req.body);
  await scoped(req, 'admin', async (db, _s, c) => {
    const r = await db.query("UPDATE admincond.relaciones_unidad SET estado='revocado' WHERE id=$1 AND condominio_id=$2 AND estado='activo' RETURNING usuario_id", [relationId, c]);
    if (!r.rowCount) fail(404, 'Relación no encontrada');
    // Sin otras relaciones y sin rol administrativo, revocar acceso al condominio.
    await db.query(`UPDATE admincond.membresias_condominio m SET estado='revocado' WHERE usuario_id=$1 AND condominio_id=$2 AND rol='residente'
   AND NOT EXISTS(SELECT 1 FROM admincond.relaciones_unidad r WHERE r.usuario_id=m.usuario_id AND r.condominio_id=m.condominio_id AND r.estado='activo')`, [r.rows[0].usuario_id, c]);
  });
  res.json({
    message: 'Acceso a la unidad revocado. Conservamos el historial.'
  });
}));
v1Router.post('/condominiums/:condoId/administrators', wrap(async (req, res) => {
  const d = parse(z.object({
    correo: email
  }), req.body);
  await scoped(req, 'client', async (db, s, c) => {
    const u = await db.query("SELECT id FROM admincond.usuarios WHERE LOWER(correo)=LOWER($1) AND estado='activo'", [d.correo]);
    if (!u.rowCount) fail(404, 'Cuenta no disponible');
    await db.query("INSERT INTO admincond.membresias_cliente(usuario_id,cliente_id,rol) VALUES($1,$2,'colaborador') ON CONFLICT(usuario_id,cliente_id) DO UPDATE SET estado='activo'", [u.rows[0].id, s.cliente_id]);
    await db.query("INSERT INTO admincond.membresias_condominio(usuario_id,cliente_id,condominio_id,rol) VALUES($1,$2,$3,'administrador') ON CONFLICT(usuario_id,condominio_id) DO UPDATE SET rol='administrador',estado='activo'", [u.rows[0].id, s.cliente_id, c]);
  });
  res.json({
    message: 'Administrador asignado sin permisos financieros automáticos.'
  });
}));
v1Router.post('/condominiums/:condoId/financial-permissions', wrap(async (req, res) => {
  const d = parse(z.object({
    correo: email,
    permiso: z.enum(['crear_cuotas', 'revisar_pagos']),
    estado: z.enum(['activo', 'revocado'])
  }), req.body);
  await scoped(req, 'client', async (db, _s, c) => {
    const u = await db.query(`SELECT u.id FROM admincond.usuarios u JOIN admincond.membresias_condominio m ON m.usuario_id=u.id JOIN admincond.membresias_cliente mc ON mc.usuario_id=u.id AND mc.cliente_id=m.cliente_id WHERE LOWER(u.correo)=LOWER($1) AND u.estado='activo' AND m.condominio_id=$2 AND m.estado='activo' AND mc.estado='activo'`, [d.correo, c]);
    if (!u.rowCount) fail(404, 'Cuenta no disponible en el condominio');
    await db.query(`INSERT INTO admincond.permisos_financieros(usuario_id,condominio_id,permiso,estado,otorgado_por,revocado_por,revocado_en)
   VALUES($1::bigint,$2::bigint,$3::varchar,$4::varchar,$5::bigint,CASE WHEN $4::varchar='revocado' THEN $5::bigint END,CASE WHEN $4::varchar='revocado' THEN NOW() END)
   ON CONFLICT(usuario_id,condominio_id,permiso) DO UPDATE SET estado=EXCLUDED.estado,
   otorgado_por=CASE WHEN EXCLUDED.estado='activo' THEN EXCLUDED.otorgado_por ELSE permisos_financieros.otorgado_por END,
   revocado_por=EXCLUDED.revocado_por,revocado_en=EXCLUDED.revocado_en`, [u.rows[0].id, c, d.permiso, d.estado, req.user.id]);
  });
  res.json({
    message: 'Permiso financiero actualizado.'
  });
}));
for (const kind of ['juntas', 'publications']) {
  v1Router.post(`/condominiums/:condoId/${kind}`, wrap(async (req, res) => {
    const d = parse(z.object({
      titulo: text(150),
      contenido: text(5000),
      ...(kind === 'juntas' ? {
        fecha: z.iso.datetime({
          offset: true
        })
      } : {})
    }), req.body);
    const r = await scoped(req, 'admin', async (db, _s, c) => {
      const query = kind === 'juntas' ? 'INSERT INTO admincond.juntas(condominio_id,titulo,contenido,creada_por,fecha) VALUES($1,$2,$3,$4,$5) RETURNING id' : 'INSERT INTO admincond.publicaciones_publicas(condominio_id,titulo,contenido,creada_por) VALUES($1,$2,$3,$4) RETURNING id';
      return (await db.query(query, [c, d.titulo, d.contenido, req.user.id, ...(kind === 'juntas' ? [d.fecha] : [])])).rows[0];
    });
    res.status(201).json(r);
  }));
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5242880,
    files: 1,
    fields: 1
  }
});
v1Router.post('/condominiums/:condoId/documents', upload.single('archivo'), wrap(async (req, res) => {
  const title = parse(text(150), req.body.titulo);
  if (!req.file?.buffer?.length) fail(400, 'Adjunta un documento PDF, PNG o JPG');
  const type = await fileTypeFromBuffer(req.file.buffer);
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(type?.mime)) fail(400, 'Solo admitimos PDF, PNG y JPG');
  const r = await scoped(req, 'admin', async (db, _s, c) => (await db.query('INSERT INTO admincond.documentos(condominio_id,titulo,nombre,tipo_mime,contenido,creada_por) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [c, title, req.file.originalname.replaceAll('\\', '/').split('/').pop().slice(0, 255), type.mime, req.file.buffer, req.user.id])).rows[0]);
  res.status(201).json(r);
}));
v1Router.get('/condominiums/:condoId/documents/:documentId', wrap(async (req, res) => {
  const documentId = parse(id, req.params.documentId);
  const d = await scoped(req, 'read', async (db, _s, c) => {
    const r = await db.query('SELECT tipo_mime,contenido FROM admincond.documentos WHERE id=$1 AND condominio_id=$2', [documentId, c]);
    if (!r.rowCount) fail(404, 'Documento no encontrado');
    return r.rows[0];
  });
  res.set({
    'Content-Type': d.tipo_mime,
    'Content-Disposition': 'attachment',
    'Cache-Control': 'no-store'
  }).send(d.contenido);
}));
v1Router.patch('/condominiums/:condoId/areas/:areaId', wrap(async (req, res) => {
  const areaId = parse(id, req.params.areaId);
  const d = parse(z.object({
    estado: z.enum(['activa', 'inactiva']),
    motivo: text(500).optional(),
    normas: z.string().trim().max(2000),
    horario: z.string().trim().max(500)
  }), req.body);
  if (d.estado === 'inactiva' && !d.motivo) fail(400, 'Indica el motivo del cierre');
  const r = await scoped(req, 'admin', async (db, _s, c) => {
    const r = await db.query('UPDATE admincond.areas_comunes SET estado=$3,motivo_cierre=$4,normas=$5,horario=$6 WHERE id=$1 AND condominio_id=$2 RETURNING id', [areaId, c, d.estado, d.estado === 'inactiva' ? d.motivo : null, d.normas, d.horario]);
    if (!r.rowCount) fail(404, 'Área no encontrada');
    return r.rows[0];
  });
  res.json(r);
}));
v1Router.get('/condominiums/:condoId/audit', wrap(async (req, res) => {
  const rows = await scoped(req, 'admin', async (db, _s, c) => (await db.query('SELECT id,tabla,registro_id,accion,usuario_id,creada_en FROM admincond.auditoria WHERE condominio_id=$1 ORDER BY id DESC LIMIT 200', [c])).rows);
  res.json({
    eventos: rows
  });
}));
