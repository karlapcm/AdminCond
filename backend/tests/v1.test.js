import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
const root = fileURLToPath(new URL('../../', import.meta.url));
const env = dotenv.parse(readFileSync(new URL('../.env.test', import.meta.url)));
if (env.DB_NAME !== 'admincond_test' || env.DB_USER !== 'admincond_test_api' || !env.JWT_SECRET) throw new Error('Configuración TEST inválida');
const marker = randomUUID();
let fixture;
const tokens = {};
function sql(query) {
  return execFileSync(process.platform === 'win32' ? 'docker.exe' : 'docker', ['compose', '-f', 'compose.test.yaml', 'exec', '-T', 'postgres-test', 'psql', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'admincond_test', '-c', query], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20000
  }).trim();
}
async function send(path, role, body, method = body ? 'POST' : 'GET') {
  return fetch(`http://127.0.0.1:3001/api/v1${path}`, {
    method,
    headers: {
      ...(role ? {
        Authorization: `Bearer ${tokens[role]}`
      } : {}),
      ...(body && !(body instanceof FormData) ? {
        'Content-Type': 'application/json'
      } : {})
    },
    body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined
  });
}
async function good(response, status = 200) {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}
before(() => {
  assert.equal(sql('SELECT current_database()'), 'admincond_test');
  sql(`INSERT INTO admincond.clientes(nombre) VALUES('V1-${marker}');
 INSERT INTO admincond.usuarios(nombre,correo,password_hash) SELECT x,'v1-'||x||'-${marker}@admincond.test','NO_LOGIN' FROM unnest(ARRAY['platform','admin','client','resident','outsider']) x;
 INSERT INTO admincond.condominios(cliente_id,nombre) SELECT id,'V1-A-${marker}' FROM admincond.clientes WHERE nombre='V1-${marker}';
 INSERT INTO admincond.condominios(cliente_id,nombre) SELECT id,'V1-B-${marker}' FROM admincond.clientes WHERE nombre='V1-${marker}';
 INSERT INTO admincond.membresias_cliente(usuario_id,cliente_id,rol) SELECT u.id,c.id,CASE WHEN u.nombre='client' THEN 'supercliente' ELSE 'colaborador' END FROM admincond.usuarios u CROSS JOIN admincond.clientes c WHERE c.nombre='V1-${marker}' AND u.correo LIKE '%-${marker}@admincond.test' AND u.nombre<>'platform';
 INSERT INTO admincond.membresias_condominio(usuario_id,cliente_id,condominio_id,rol) SELECT u.id,c.cliente_id,c.id,CASE WHEN u.nombre='admin' THEN 'administrador' ELSE 'residente' END FROM admincond.usuarios u CROSS JOIN admincond.condominios c WHERE u.correo LIKE '%-${marker}@admincond.test' AND ((u.nombre IN ('admin','resident') AND c.nombre='V1-A-${marker}') OR (u.nombre='outsider' AND c.nombre='V1-B-${marker}'));
 INSERT INTO admincond.administradores_plataforma(usuario_id) SELECT id FROM admincond.usuarios WHERE correo='v1-platform-${marker}@admincond.test';
 INSERT INTO admincond.unidades(condominio_id,codigo,tipo) SELECT id,'101','departamento' FROM admincond.condominios WHERE nombre='V1-A-${marker}';
 INSERT INTO admincond.relaciones_unidad(usuario_id,condominio_id,unidad_id,es_ocupante,es_principal) SELECT u.id,un.condominio_id,un.id,true,true FROM admincond.usuarios u CROSS JOIN admincond.unidades un JOIN admincond.condominios c ON c.id=un.condominio_id WHERE u.correo='v1-resident-${marker}@admincond.test' AND c.nombre='V1-A-${marker}';`);
  fixture = JSON.parse(sql(`SELECT json_build_object('a',(SELECT id FROM admincond.condominios WHERE nombre='V1-A-${marker}'),'b',(SELECT id FROM admincond.condominios WHERE nombre='V1-B-${marker}'),'unit',(SELECT un.id FROM admincond.unidades un JOIN admincond.condominios c ON c.id=un.condominio_id WHERE c.nombre='V1-A-${marker}'))`));
  for (const role of ['platform', 'admin', 'client', 'resident', 'outsider']) {
    const uid = sql(`SELECT id FROM admincond.usuarios WHERE correo='v1-${role}-${marker}@admincond.test'`);
    const sid = randomUUID();
    sql(`INSERT INTO admincond.sesiones(id,usuario_id,refresh_hash,expira_en) VALUES('${sid}',${uid},'${randomUUID()}',NOW()+INTERVAL '1 hour')`);
    tokens[role] = jwt.sign({
      sid
    }, env.JWT_SECRET, {
      algorithm: 'HS256',
      subject: uid,
      issuer: 'admincond-api',
      audience: 'admincond-app',
      expiresIn: '15m'
    });
  }
});
after(() => {
  const condos = sql(`SELECT COALESCE(string_agg(id::text,','),'0') FROM admincond.condominios WHERE nombre LIKE '%${marker}'`);
  const users = sql(`SELECT COALESCE(string_agg(id::text,','),'0') FROM admincond.usuarios WHERE correo LIKE '%-${marker}@admincond.test'`);
  // Solo elimino fixtures de esta ejecución, con defensa adicional de nombre de base.
  sql(`DO $$ BEGIN IF current_database()<>'admincond_test' THEN RAISE EXCEPTION 'Base incorrecta'; END IF; END $$;
 DELETE FROM admincond.solicitudes_afiliacion WHERE correo LIKE '%-${marker}@admincond.test';
 DELETE FROM admincond.documentos WHERE condominio_id IN (SELECT id FROM admincond.condominios WHERE nombre LIKE '%${marker}');
 DELETE FROM admincond.juntas WHERE condominio_id IN (SELECT id FROM admincond.condominios WHERE nombre LIKE '%${marker}');
 DELETE FROM admincond.publicaciones_publicas WHERE condominio_id IN (SELECT id FROM admincond.condominios WHERE nombre LIKE '%${marker}');
 DELETE FROM admincond.areas_comunes WHERE condominio_id IN (SELECT id FROM admincond.condominios WHERE nombre LIKE '%${marker}');
 DELETE FROM admincond.comprobantes WHERE pago_id IN (SELECT p.id FROM admincond.pagos p JOIN admincond.condominios c ON c.id=p.condominio_id WHERE c.nombre LIKE '%${marker}');
 DELETE FROM admincond.pagos WHERE condominio_id IN (SELECT id FROM admincond.condominios WHERE nombre LIKE '%${marker}');
 DELETE FROM admincond.cuotas WHERE condominio_id IN (SELECT id FROM admincond.condominios WHERE nombre LIKE '%${marker}');
 DELETE FROM admincond.permisos_financieros WHERE condominio_id IN (SELECT id FROM admincond.condominios WHERE nombre LIKE '%${marker}');
 DELETE FROM admincond.relaciones_unidad WHERE condominio_id IN (SELECT id FROM admincond.condominios WHERE nombre LIKE '%${marker}');
 DELETE FROM admincond.unidades WHERE condominio_id IN (SELECT id FROM admincond.condominios WHERE nombre LIKE '%${marker}');
 DELETE FROM admincond.edificios WHERE condominio_id IN (SELECT id FROM admincond.condominios WHERE nombre LIKE '%${marker}');
 DELETE FROM admincond.membresias_condominio WHERE condominio_id IN (SELECT id FROM admincond.condominios WHERE nombre LIKE '%${marker}');
 DELETE FROM admincond.membresias_cliente WHERE cliente_id IN (SELECT id FROM admincond.clientes WHERE nombre LIKE '%${marker}');
 DELETE FROM admincond.condominios WHERE nombre LIKE '%${marker}';
 DELETE FROM admincond.clientes WHERE nombre LIKE '%${marker}';
 DELETE FROM admincond.administradores_plataforma WHERE usuario_id IN (SELECT id FROM admincond.usuarios WHERE correo LIKE '%-${marker}@admincond.test');
 DELETE FROM admincond.usuarios WHERE correo LIKE '%-${marker}@admincond.test';
 DELETE FROM admincond.auditoria WHERE condominio_id IN (${condos}) OR usuario_id IN (${users});`);
});
test('V1-01: ningún perfil puede falsificar un Super Admin', async () => {
  assert.equal((await send('/affiliations')).status, 401);
  assert.equal((await send('/affiliations', 'resident')).status, 403);
  assert.equal((await send('/affiliations', 'admin')).status, 403);
  assert.equal((await send('/affiliations', 'client')).status, 403);
  await good(await send('/affiliations', 'platform'));
  assert.equal((await send(`/condominiums/${fixture.a}/workspace`, 'platform')).status, 404);
});
test('V1-02: aislamiento entre condominios del mismo cliente', async () => {
  const own = await good(await send(`/condominiums/${fixture.a}/workspace`, 'admin'));
  assert.equal(own.admin, true);
  assert.equal((await send(`/condominiums/${fixture.b}/workspace`, 'admin')).status, 404);
  assert.equal((await send(`/condominiums/${fixture.a}/workspace`, 'outsider')).status, 404);
  assert.equal((await send('/condominiums/no-es-id/workspace', 'admin')).status, 400);
});
test('V1-03: residente no crea unidades, juntas ni publicaciones', async () => {
  for (const [path, body] of [['units', {
    codigo: 'intruso',
    tipo: 'casa'
  }], ['juntas', {
    titulo: 'Intruso',
    contenido: 'No permitido',
    fecha: new Date().toISOString()
  }], ['publications', {
    titulo: 'Intruso',
    contenido: 'No permitido'
  }]]) assert.equal((await send(`/condominiums/${fixture.a}/${path}`, 'resident', body)).status, 404);
});
test('V1-04: edificio ajeno no se puede asociar a una unidad', async () => {
  const building = await good(await send(`/condominiums/${fixture.a}/buildings`, 'admin', {
    nombre: 'Torre de prueba'
  }), 201);
  await good(await send(`/condominiums/${fixture.a}/units`, 'admin', {
    codigo: '102',
    tipo: 'departamento',
    edificioId: building.id,
    piso: '1'
  }), 201);
  assert.equal((await send(`/condominiums/${fixture.b}/units`, 'outsider', {
    codigo: 'intrusa',
    tipo: 'casa',
    edificioId: building.id
  })).status, 404);
});
test('V1-05: documentos privados requieren ámbito y descarga protegida', async () => {
  const body = new FormData();
  body.append('titulo', 'Documento interno');
  body.append('archivo', new Blob(['%PDF-1.4\n1 0 obj<</Type /Catalog>>endobj\n%%EOF'], {
    type: 'application/pdf'
  }), 'normas.pdf');
  const d = await good(await send(`/condominiums/${fixture.a}/documents`, 'admin', body), 201);
  assert.equal((await send(`/condominiums/${fixture.a}/documents/${d.id}`, 'outsider')).status, 404);
  assert.equal((await send(`/condominiums/${fixture.b}/documents/${d.id}`, 'outsider')).status, 404);
  const allowed = await send(`/condominiums/${fixture.a}/documents/${d.id}`, 'resident');
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('content-disposition'), 'attachment');
  assert.equal(allowed.headers.get('cache-control'), 'no-store');
  assert.equal((await send(`/condominiums/${fixture.a}/documents/${d.id}`)).status, 401);
  const invalid = new FormData();
  invalid.append('titulo', 'No PDF');
  invalid.append('archivo', new Blob(['<script>alert(1)</script>'], {
    type: 'application/pdf'
  }), 'falso.pdf');
  assert.equal((await send(`/condominiums/${fixture.a}/documents`, 'admin', invalid)).status, 400);
});
test('V1-06: publicación pública no filtra documentos o cuentas', async () => {
  await good(await send(`/condominiums/${fixture.a}/publications`, 'admin', {
    titulo: `Noticia ${marker}`,
    contenido: 'Solo contenido público'
  }), 201);
  const r = await good(await send('/publications'));
  const post = r.publicaciones.find(p => p.titulo === `Noticia ${marker}`);
  assert.ok(post);
  assert.equal(post.correo, undefined);
  assert.equal(post.documentos, undefined);
  assert.equal(post.creada_por, undefined);
});
test('V1-07: solo Supercliente concede permisos financieros explícitos', async () => {
  const body = {
    correo: `v1-admin-${marker}@admincond.test`,
    permiso: 'crear_cuotas',
    estado: 'activo'
  };
  assert.equal((await send(`/condominiums/${fixture.a}/financial-permissions`, 'admin', body)).status, 404);
  const before = await good(await send(`/condominiums/${fixture.a}/workspace`, 'admin'));
  assert.deepEqual(before.permisos, []);
  await good(await send(`/condominiums/${fixture.a}/financial-permissions`, 'client', body));
  assert.ok((await good(await send(`/condominiums/${fixture.a}/workspace`, 'admin'))).permisos.includes('crear_cuotas'));
  await good(await send(`/condominiums/${fixture.a}/financial-permissions`, 'client', {
    ...body,
    estado: 'revocado'
  }));
  assert.deepEqual((await good(await send(`/condominiums/${fixture.a}/workspace`, 'admin'))).permisos, []);
});
test('V1-08: afiliación requiere revisión y no admite doble aprobación', async () => {
  await good(await send('/affiliations', null, {
    nombre: 'Contacto',
    correo: `v1-client-${marker}@admincond.test`,
    cliente: `Afiliado-${marker}`,
    condominio: `Afiliado-${marker}`,
    direccion: 'Dirección sintética'
  }), 202);
  const all = await good(await send('/affiliations', 'platform'));
  const s = all.solicitudes.find(s => s.correo === `v1-client-${marker}@admincond.test`);
  assert.ok(s);
  assert.equal((await send(`/affiliations/${s.id}/review`, 'admin', {
    decision: 'aprobar'
  })).status, 403);
  await good(await send(`/affiliations/${s.id}/review`, 'platform', {
    decision: 'aprobar'
  }));
  assert.equal((await send(`/affiliations/${s.id}/review`, 'platform', {
    decision: 'aprobar'
  })).status, 409);
});
test('V1-09: auditoría no expone contraseñas, documentos ni tokens', async () => {
  const body = await good(await send(`/condominiums/${fixture.a}/audit`, 'admin'));
  assert.ok(body.eventos.some(e => e.tabla === 'documentos'));
  for (const event of body.eventos) {
    assert.equal(event.password_hash, undefined);
    assert.equal(event.contenido, undefined);
    assert.equal(event.token_hash, undefined);
  }
  assert.equal((await send(`/condominiums/${fixture.a}/audit`, 'resident')).status, 404);
  assert.equal(sql("SELECT has_table_privilege('admincond_app','admincond.auditoria','UPDATE')"), 'f');
  assert.equal(sql("SELECT has_table_privilege('admincond_app','admincond.administradores_plataforma','INSERT')"), 'f');
});
test('V1-10: residente adicional necesita autorización financiera explícita', async () => {
  const uid = sql(`SELECT id FROM admincond.usuarios WHERE correo='v1-admin-${marker}@admincond.test'`);
  const fee = sql(`INSERT INTO admincond.cuotas(condominio_id,unidad_id,concepto,periodo,monto,vencimiento,creada_por) VALUES(${fixture.a},${fixture.unit},'Cuota privada','2026-11-01',100,'2026-11-30',${uid}) RETURNING id`);
  sql(`UPDATE admincond.relaciones_unidad SET es_principal=false,responsable_pago=false,acceso_financiero=false WHERE unidad_id=${fixture.unit}`);
  assert.deepEqual((await good(await send(`/condominiums/${fixture.a}/fees`, 'resident'))).cuotas, []);
  const denied = await fetch('http://127.0.0.1:3001/api/finance/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.resident}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      cuotaId: fee,
      monto: '20.00'
    })
  });
  assert.equal(denied.status, 404);
  await good(await send(`/condominiums/${fixture.a}/people`, 'admin', {
    unidadId: fixture.unit,
    correo: `v1-resident-${marker}@admincond.test`,
    esPropietario: false,
    esInquilino: false,
    esOcupante: true,
    esPrincipal: false,
    responsablePago: false,
    accesoFinanciero: true
  }), 201);
  assert.equal((await good(await send(`/condominiums/${fixture.a}/fees`, 'resident'))).cuotas.length, 1);
});
test('V1-11: retirar residencia revoca acceso y conserva relación histórica', async () => {
  const relation = sql(`SELECT id FROM admincond.relaciones_unidad WHERE unidad_id=${fixture.unit}`);
  assert.equal((await send(`/condominiums/${fixture.a}/people/${relation}/revoke`, 'admin', {})).status, 400);
  await good(await send(`/condominiums/${fixture.a}/people/${relation}/revoke`, 'admin', {
    confirmar: true
  }));
  assert.equal((await send(`/condominiums/${fixture.a}/workspace`, 'resident')).status, 404);
  assert.equal(sql(`SELECT estado FROM admincond.relaciones_unidad WHERE id=${relation}`), 'revocado');
});
test('V1-12: un administrador no puede reactivar el alcance de un Supercliente revocado',async()=>{
 const client=sql(`SELECT id FROM admincond.usuarios WHERE correo='v1-client-${marker}@admincond.test'`);
 const clientId=sql(`SELECT cliente_id FROM admincond.condominios WHERE id=${fixture.a}`);
 sql(`UPDATE admincond.membresias_cliente SET estado='revocado' WHERE usuario_id=${client} AND cliente_id=${clientId}`);
 try {
  const response=await send(`/condominiums/${fixture.a}/people`,'admin',{unidadId:fixture.unit,correo:`v1-client-${marker}@admincond.test`,esPropietario:false,esInquilino:false,esOcupante:true,esPrincipal:false,responsablePago:false});
  assert.equal(response.status,403);
  assert.equal(sql(`SELECT estado FROM admincond.membresias_cliente WHERE usuario_id=${client} AND cliente_id=${clientId}`),'revocado');
 }finally{sql(`UPDATE admincond.membresias_cliente SET estado='activo' WHERE usuario_id=${client} AND cliente_id=${clientId}`);}
});
test('V1-13: crear una cuenta no concede roles de plataforma enviados en el formulario',async()=>{
 const data=await good(await send('/accounts','admin',{nombre:'Cuenta invitada',correo:`v1-new-${marker}@admincond.test`,condominioId:fixture.a,superAdmin:true}),201);
 assert.equal(data.token,undefined);assert.equal(data.cuenta.password_hash,undefined);assert.equal(data.entrega,'enviada');
 assert.equal(sql(`SELECT COUNT(*) FROM admincond.administradores_plataforma WHERE usuario_id=${data.cuenta.id}`),'0');
});
test('V1-14: otro condominio del cliente sigue requiriendo aprobación de plataforma',async()=>{
 const nombre=`Solicitud-${marker}`;
 await good(await send(`/condominiums/${fixture.a}/siblings`,'client',{nombre,direccion:'Dirección sintética'}),202);
 assert.equal(sql(`SELECT COUNT(*) FROM admincond.condominios WHERE nombre='${nombre}'`),'0');
 const requestId=sql(`SELECT id FROM admincond.solicitudes_afiliacion WHERE condominio='${nombre}' AND estado='pendiente'`);
 assert.match(requestId,/^\d+$/);
 await good(await send(`/affiliations/${requestId}/review`,'platform',{decision:'aprobar'}));
 assert.equal(sql(`SELECT COUNT(*) FROM admincond.condominios nuevo JOIN admincond.condominios original ON original.cliente_id=nuevo.cliente_id WHERE nuevo.nombre='${nombre}' AND original.id=${fixture.a}`),'1');
});
