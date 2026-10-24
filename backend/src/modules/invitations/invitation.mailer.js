
import nodemailer from "nodemailer";

function getMailConfig() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
  } = process.env;

  if (
    !SMTP_HOST ||
    !SMTP_PORT ||
    !SMTP_USER ||
    !SMTP_PASS ||
    !SMTP_FROM
  ) {
    throw new Error("Servicio de correo no configurado");
  }

  const port = Number(SMTP_PORT);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Puerto SMTP inválido");
  }

  return {
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    from: SMTP_FROM,
  };
}
// Verifica la configuración antes de aprobar una solicitud.
// No inicia conexiones SMTP ni devuelve credenciales.
export function assertInvitationMailConfigured() {
  getMailConfig();
}

export async function sendInvitationEmail(
  { to, token, expiresInHours },
  { createTransport = nodemailer.createTransport } = {}
) {

  const config = getMailConfig();

  // Transporte simulado, permitido exclusivamente en TEST.
  // No realiza conexiones SMTP ni envía correos.
  const useTestTransport =
    process.env.NODE_ENV === "test" &&
    process.env.DB_NAME === "admincond_test" &&
    process.env.SMTP_TEST_TRANSPORT === "true";

  const transport = useTestTransport
    ? createTransport({
        jsonTransport: true,
      })
    : createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        requireTLS: !config.secure,
        auth: config.auth,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });

  try {
    await transport.sendMail({
      from: config.from,
      to,
      subject: "Invitación para unirte a AdminCond",
      text: [
        "Has recibido una invitación para unirte a una unidad en AdminCond.",
        "",
        "Inicia sesión con la cuenta asociada a este correo.",
        "En la sección Invitaciones y solicitudes, utiliza este token:",
        "",
        token,
        "",
        `La invitación vence en ${expiresInHours} horas.`,
        "Si no esperabas esta invitación, ignora el mensaje.",
      ].join("\n"),
    });
  } finally {
    transport.close();
  }
}
