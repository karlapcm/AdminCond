
import { randomBytes, createHash } from "node:crypto";
import { pool } from "../../database/pool.js";

const INVITATION_HOURS = 48;

function hashToken(token) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function publicError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function transaction(callback) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// 1. El principal solicita agregar a alguien.
// No puede elegir arbitrariamente otra unidad.
export async function requestResident(userId, unitId, email) {
  return transaction(async (db) => {
    const permission = await db.query(
      `SELECT u.id, u.condominio_id
       FROM admincond.unidades u
       JOIN admincond.condominios co
         ON co.id = u.condominio_id
       JOIN admincond.clientes c
         ON c.id = co.cliente_id
       JOIN admincond.relaciones_unidad r
         ON r.unidad_id = u.id
        AND r.condominio_id = co.id
       JOIN admincond.membresias_condominio mco
         ON mco.usuario_id = r.usuario_id
        AND mco.condominio_id = co.id
        AND mco.cliente_id = c.id
       JOIN admincond.membresias_cliente mc
         ON mc.usuario_id = r.usuario_id
        AND mc.cliente_id = c.id
       WHERE u.id = $1
         AND r.usuario_id = $2
         AND r.es_principal = TRUE
         AND r.estado = 'activo'
         AND mco.estado = 'activo'
         AND mc.estado = 'activo'
         AND u.estado = 'activa'
         AND co.estado = 'activo'
         AND c.estado = 'activo'`,
      [unitId, userId]
    );

    const unit = permission.rows[0];

    if (!unit) {
      throw publicError(404, "Unidad no encontrada o sin permiso");
    }

    const correo = normalizeEmail(email);

    // Solo invitamos cuentas existentes en esta primera versión.
    const invited = await db.query(
      `SELECT id FROM admincond.usuarios
       WHERE LOWER(correo) = $1
         AND estado = 'activo'`,
      [correo]
    );

    if (!invited.rowCount) {
      throw publicError(
        400,
        "Para esta prueba, el invitado debe tener una cuenta activa"
      );
    }

    if (String(invited.rows[0].id) === String(userId)) {
      throw publicError(400, "No puedes invitarte a ti mismo");
    }

    const existing = await db.query(
      `SELECT id FROM admincond.relaciones_unidad
       WHERE usuario_id = $1
         AND unidad_id = $2
         AND estado = 'activo'`,
      [invited.rows[0].id, unitId]
    );

    if (existing.rowCount) {
      throw publicError(409, "El usuario ya pertenece a esta unidad");
    }

    const result = await db.query(
      `INSERT INTO admincond.solicitudes_residentes
         (unidad_id, condominio_id, solicitado_por, correo_invitado)
       VALUES ($1, $2, $3, $4)
       RETURNING id, unidad_id, correo_invitado, estado, creada_en`,
      [unitId, unit.condominio_id, userId, correo]
    );

    return result.rows[0];
  });
}

// 2. Administradores autorizados consultan solicitudes.
export async function pendingRequests(userId) {
  const result = await pool.query(
    `SELECT s.id, s.unidad_id, s.condominio_id,
            s.correo_invitado, s.estado, s.creada_en
     FROM admincond.solicitudes_residentes s
     JOIN admincond.condominios co
       ON co.id = s.condominio_id
     JOIN admincond.clientes c
       ON c.id = co.cliente_id
     JOIN admincond.membresias_condominio mco
       ON mco.condominio_id = co.id
      AND mco.cliente_id = c.id
     JOIN admincond.membresias_cliente mc
       ON mc.usuario_id = mco.usuario_id
      AND mc.cliente_id = c.id
     WHERE mco.usuario_id = $1
       AND mco.rol = 'administrador'
       AND mco.estado = 'activo'
       AND mc.estado = 'activo'
       AND s.estado = 'pendiente'
       AND co.estado = 'activo'
       AND c.estado = 'activo'
     ORDER BY s.creada_en`,
    [userId]
  );

  return result.rows;
}

// 3. Administrador aprueba o rechaza.
export async function reviewRequest(userId, requestId, decision) {
  return transaction(async (db) => {
    const found = await db.query(
      `SELECT s.id, s.unidad_id, s.condominio_id,
              s.correo_invitado, s.estado
       FROM admincond.solicitudes_residentes s
       JOIN admincond.unidades u
         ON u.id = s.unidad_id
        AND u.condominio_id = s.condominio_id
       JOIN admincond.condominios co
         ON co.id = s.condominio_id
       JOIN admincond.clientes c
         ON c.id = co.cliente_id
       JOIN admincond.membresias_condominio mco
         ON mco.condominio_id = co.id
        AND mco.cliente_id = c.id
       JOIN admincond.membresias_cliente mc
         ON mc.usuario_id = mco.usuario_id
        AND mc.cliente_id = c.id
       WHERE s.id = $1
         AND mco.usuario_id = $2
         AND mco.rol = 'administrador'
         AND mco.estado = 'activo'
         AND mc.estado = 'activo'
         AND u.estado = 'activa'
         AND co.estado = 'activo'
         AND c.estado = 'activo'
         AND s.solicitado_por <> $2
       FOR UPDATE OF s`,
      [requestId, userId]
    );

    const request = found.rows[0];

    if (!request) {
      throw publicError(404, "Solicitud no encontrada o sin permiso");
    }

    if (request.estado !== "pendiente") {
      throw publicError(409, "Solicitud ya revisada");
    }

    const estado = decision === "aprobar" ? "aprobada" : "rechazada";

    await db.query(
      `UPDATE admincond.solicitudes_residentes
       SET estado = $1,
           revisado_por = $2,
           revisada_en = NOW()
       WHERE id = $3`,
      [estado, userId, requestId]
    );

    if (decision === "rechazar") {
      return { estado: "rechazada" };
    }

    const token = randomBytes(32).toString("base64url");

    const invitationResult = await db.query(
      `INSERT INTO admincond.invitaciones
        (solicitud_id, token_hash, correo_destino, expira_en)
      VALUES ($1, $2, $3, NOW() + INTERVAL '48 hours')
      RETURNING id`,
      [requestId, hashToken(token), request.correo_invitado]
    );

    // Solo para entrega manual en nuestro laboratorio local.
    // Nunca registrarlo en logs ni subirlo a GitHub.
    return {
      estado: "aprobada",
      invitacion: {
        id: invitationResult.rows[0].id,
        correoDestino: request.correo_invitado,
        token,
        expiraEnHoras: INVITATION_HOURS,
      },
    };
  });
}

// 4. La persona invitada acepta.
// El bloqueo y las escrituras se hacen en una transacción.
export async function acceptInvitation(userId, token) {
  return transaction(async (db) => {
    const found = await db.query(
      `SELECT i.id, i.estado, i.expira_en,
              i.correo_destino,
              s.unidad_id, s.condominio_id,
              co.cliente_id,
              u.correo AS correo_usuario
       FROM admincond.invitaciones i
       JOIN admincond.solicitudes_residentes s
         ON s.id = i.solicitud_id
       JOIN admincond.unidades un
         ON un.id = s.unidad_id
        AND un.condominio_id = s.condominio_id
       JOIN admincond.condominios co
         ON co.id = s.condominio_id
       JOIN admincond.clientes c
         ON c.id = co.cliente_id
       JOIN admincond.usuarios u
         ON u.id = $2
       WHERE i.token_hash = $1
         AND s.estado = 'aprobada'
         AND u.estado = 'activo'
         AND un.estado = 'activa'
         AND co.estado = 'activo'
         AND c.estado = 'activo'
       FOR UPDATE OF i`,
      [hashToken(token), userId]
    );

    const invitation = found.rows[0];

    if (
      !invitation ||
      invitation.estado !== "pendiente" ||
      new Date(invitation.expira_en) <= new Date()
    ) {
      throw publicError(400, "Invitación inválida o expirada");
    }

    if (
      normalizeEmail(invitation.correo_usuario) !==
      normalizeEmail(invitation.correo_destino)
    ) {
      throw publicError(403, "Esta invitación no te pertenece");
    }

    // Relación con cliente: nunca sustituimos un rol existente.
    await db.query(
      `INSERT INTO admincond.membresias_cliente
         (usuario_id, cliente_id, rol, estado)
       VALUES ($1, $2, 'colaborador', 'activo')
       ON CONFLICT (usuario_id, cliente_id)
       DO NOTHING`,
      [userId, invitation.cliente_id]
    );

    // Relación con condominio: tampoco elevamos roles existentes.
    await db.query(
      `INSERT INTO admincond.membresias_condominio
         (usuario_id, cliente_id, condominio_id, rol, estado)
       VALUES ($1, $2, $3, 'residente', 'activo')
       ON CONFLICT (usuario_id, condominio_id)
       DO NOTHING`,
      [userId, invitation.cliente_id, invitation.condominio_id]
    );

    // Si una membresía anterior está revocada, no se reactiva
    // silenciosamente mediante una invitación.
    const membership = await db.query(
      `SELECT 1
       FROM admincond.membresias_cliente mc
       JOIN admincond.membresias_condominio mco
         ON mco.usuario_id = mc.usuario_id
        AND mco.cliente_id = mc.cliente_id
       WHERE mc.usuario_id = $1
         AND mc.cliente_id = $2
         AND mco.condominio_id = $3
         AND mc.estado = 'activo'
         AND mco.estado = 'activo'`,
      [
        userId,
        invitation.cliente_id,
        invitation.condominio_id,
      ]
    );

    if (!membership.rowCount) {
      throw publicError(
        409,
        "La cuenta tiene una membresía revocada. Requiere revisión."
      );
    }

    await db.query(
      `INSERT INTO admincond.relaciones_unidad
         (usuario_id, condominio_id, unidad_id,
          es_ocupante, es_principal, estado)
       VALUES ($1, $2, $3, TRUE, FALSE, 'activo')
       ON CONFLICT (usuario_id, unidad_id)
       DO NOTHING`,
      [userId, invitation.condominio_id, invitation.unidad_id]
    );

    const relation = await db.query(
      `SELECT 1
       FROM admincond.relaciones_unidad
       WHERE usuario_id = $1
         AND unidad_id = $2
         AND estado = 'activo'`,
      [userId, invitation.unidad_id]
    );

    if (!relation.rowCount) {
      throw publicError(
        409,
        "La relación anterior requiere revisión administrativa"
      );
    }

    await db.query(
      `UPDATE admincond.invitaciones
       SET estado = 'utilizada',
           utilizada_en = NOW(),
           usuario_acepto = $1
       WHERE id = $2`,
      [userId, invitation.id]
    );

    return {
      message: "Invitación aceptada correctamente",
      unidadId: invitation.unidad_id,
    };
  });
}
