
import test from "node:test";
import assert from "node:assert/strict";

import {
  sendInvitationEmail,
} from "../src/modules/invitations/invitation.mailer.js";

const smtpVariables = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
];

// Guarda la configuración original y la restaura siempre.
async function withSmtpEnv(values, callback) {
  const previous = Object.fromEntries(
    smtpVariables.map((key) => [key, process.env[key]])
  );

  try {
    for (const key of smtpVariables) {
      delete process.env[key];
    }

    Object.assign(process.env, values);

    await callback();
  } finally {
    for (const key of smtpVariables) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test("D31-03: SMTP sin configurar no intenta enviar correo", async () => {
  await withSmtpEnv({}, async () => {
    await assert.rejects(
      sendInvitationEmail({
        to: "residente@admincond.test",
        token: "TOKEN_FICTICIO_SOLO_TEST",
        expiresInHours: 48,
      }),
      {
        message: "Servicio de correo no configurado",
      }
    );
  });
});

test("D31-04: SMTP rechaza un puerto inválido", async () => {
  await withSmtpEnv(
    {
      SMTP_HOST: "smtp.example.test",
      SMTP_PORT: "99999",
      SMTP_USER: "usuario-test",
      SMTP_PASS: "clave-ficticia",
      SMTP_FROM: "AdminCond <no-reply@example.test>",
    },
    async () => {
      await assert.rejects(
        sendInvitationEmail({
          to: "residente@admincond.test",
          token: "TOKEN_FICTICIO_SOLO_TEST",
          expiresInHours: 48,
        }),
        {
          message: "Puerto SMTP inválido",
        }
      );
    }
  );
});


const validSmtpConfig = {
  SMTP_HOST: "smtp.example.test",
  SMTP_PORT: "587",
  SMTP_USER: "usuario-test",
  SMTP_PASS: "clave-ficticia",
  SMTP_FROM: "AdminCond <no-reply@example.test>",
};

test("D31-05: construye la invitación sin enviar correo real", async () => {
  await withSmtpEnv(validSmtpConfig, async () => {
    let capturedOptions;
    let capturedMessage;
    let closed = false;

    const fakeCreateTransport = (options) => {
      capturedOptions = options;

      return {
        async sendMail(message) {
          capturedMessage = message;
          return { messageId: "simulado-test" };
        },
        close() {
          closed = true;
        },
      };
    };

    const token = "TOKEN_FICTICIO_D31_05";

    await sendInvitationEmail(
      {
        to: "residente@admincond.test",
        token,
        expiresInHours: 48,
      },
      {
        createTransport: fakeCreateTransport,
      }
    );

    assert.equal(capturedOptions.host, "smtp.example.test");
    assert.equal(capturedOptions.port, 587);
    assert.equal(capturedOptions.secure, false);
    assert.equal(capturedOptions.requireTLS, true);

    assert.equal(
      capturedMessage.to,
      "residente@admincond.test"
    );

    assert.equal(
      capturedMessage.subject,
      "Invitación para unirte a AdminCond"
    );

    assert.ok(capturedMessage.text.includes(token));
    assert.ok(capturedMessage.text.includes("48 horas"));
    assert.equal(closed, true);
  });
});

test("D31-06: error SMTP se propaga y cierra el transporte", async () => {
  await withSmtpEnv(validSmtpConfig, async () => {
    let closed = false;

    const fakeCreateTransport = () => ({
      async sendMail() {
        throw new Error("SMTP_SIMULADO_NO_DISPONIBLE");
      },
      close() {
        closed = true;
      },
    });

    await assert.rejects(
      sendInvitationEmail(
        {
          to: "residente@admincond.test",
          token: "TOKEN_FICTICIO_D31_06",
          expiresInHours: 48,
        },
        {
          createTransport: fakeCreateTransport,
        }
      ),
      {
        message: "SMTP_SIMULADO_NO_DISPONIBLE",
      }
    );

    assert.equal(
      closed,
      true,
      "El transporte debe cerrarse incluso si SMTP falla"
    );
  });
});