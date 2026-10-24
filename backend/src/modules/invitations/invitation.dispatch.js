import { sendInvitationEmail } from "./invitation.mailer.js";
import {
  claimInvitationDelivery,
  recordInvitationDelivery,
} from "./invitation.delivery.js";

/**
 * Coordina un intento de entrega.
 *
 * Requiere una invitación nueva o reemitida con un
 * token disponible únicamente en memoria.
 *
 * IMPORTANTE:
 * Todavía no controla envíos concurrentes.
 * No conectar directamente a rutas HTTP.
 */

/**
 * Coordina un intento de entrega.
 *
 * Orden:
 * 1. Reclamar invitación en PostgreSQL.
 * 2. Intentar envío SMTP.
 * 3. Registrar el resultado.
 *
 * No conectar todavía a rutas HTTP.
 */
export async function dispatchInvitation(
  { invitationId, to, token, expiresInHours },
  {
    claim = claimInvitationDelivery,
    send = sendInvitationEmail,
    record = recordInvitationDelivery,
  } = {}
) {
  // Primero reclamamos el envío.
  const claimed = await claim(invitationId);

  if (!claimed) {
    return {
      estadoEntrega: "no_disponible",
    };
  }

  // Solo quien consiguió el reclamo puede contactar SMTP.
  try {
    await send({
      to,
      token,
      expiresInHours,
    });
  } catch {
    // No exponemos detalles privados del proveedor SMTP.
    await record(invitationId, false);

    return {
      estadoEntrega: "fallido",
    };
  }

  // Si SMTP aceptó el mensaje pero falla PostgreSQL,
  // propagamos el error: NO reenviamos automáticamente.
  await record(invitationId, true);

  return {
    estadoEntrega: "enviado",
  };
}