
import nodemailer from "nodemailer";

function getRecoveryMailConfig() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
  } = process.env;

  const port = Number(SMTP_PORT);

  if (
    !SMTP_HOST ||
    !SMTP_PORT ||
    !SMTP_USER ||
    !SMTP_PASS ||
    !SMTP_FROM ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error("Servicio de correo no configurado");
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

/**
 * Envía un código temporal de recuperación.
 *
 * Nunca registrar el token en logs.
 * TEST utiliza jsonTransport; no contacta SMTP.
 */
export async function sendAccessRecoveryEmail(
  { to, token },
  {
    createTransport = nodemailer.createTransport,
    config = getRecoveryMailConfig(),
  } = {}
) {
  const isTestTransport =
    process.env.NODE_ENV === "test" &&
    process.env.DB_NAME === "admincond_test" &&
    process.env.SMTP_TEST_TRANSPORT === "true";

  const transport = createTransport(
    isTestTransport
      ? { jsonTransport: true }
      : {
          host: config.host,
          port: config.port,
          secure: config.secure,
          requireTLS: !config.secure,
          auth: config.auth,
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        }
  );

  try {
    await transport.sendMail({
      from: config.from,
      to,
      subject: "Recuperación de acceso a AdminCond",
      text: [
        "Se solicitó recuperar el acceso a tu cuenta de AdminCond.",
        "",
        "Tu código temporal de recuperación es:",
        "",
        token,
        "",
        "Este código vence en 30 minutos.",
        "Si no solicitaste recuperar tu acceso,",
        "puedes ignorar este mensaje.",
        "",
        "No compartas este código con otras personas.",
      ].join("\n"),
    });
  } finally {
    transport.close();
  }
}
