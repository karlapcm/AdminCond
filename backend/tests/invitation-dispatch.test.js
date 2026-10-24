
import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchInvitation,
} from "../src/modules/invitations/invitation.dispatch.js";

const invitation = {
  invitationId: 123,
  to: "residente@admincond.test",
  token: "TOKEN_FICTICIO_SOLO_TEST",
  expiresInHours: 48,
};

test("D31-09: SMTP aceptado registra envío exitoso", async () => {
  const calls = [];

  const result = await dispatchInvitation(
    invitation,
    {
      claim: async (id) => {
        assert.equal(id, 123);

        return {
          id,
          estado_entrega: "enviando",
        };
      },
      send: async (message) => {
        calls.push(["send", message]);
      },
      record: async (id, accepted) => {
        calls.push(["record", id, accepted]);
      },
    }
  );

  assert.equal(result.estadoEntrega, "enviado");

  assert.deepEqual(calls, [
    [
      "send",
      {
        to: invitation.to,
        token: invitation.token,
        expiresInHours: 48,
      },
    ],
    ["record", 123, true],
  ]);
});

test("D31-10: SMTP fallido registra fallo sin filtrar errores", async () => {
  const calls = [];

  const result = await dispatchInvitation(
    invitation,
    {
      claim: async (id) => {
        assert.equal(id, 123);

        return {
          id,
          estado_entrega: "enviando",
        };
      },
      send: async () => {
        calls.push("send");
        throw new Error("ERROR_PRIVADO_DEL_PROVEEDOR");
      },
      record: async (id, accepted) => {
        calls.push(["record", id, accepted]);
      },
    }
  );

  assert.deepEqual(calls, [
    "send",
    ["record", 123, false],
  ]);

  assert.deepEqual(result, {
    estadoEntrega: "fallido",
  });
});

test("D31-11: fallo de BD tras SMTP aceptado no reenvía correo", async () => {
  let sendCount = 0;
  let recordCount = 0;

  await assert.rejects(
    dispatchInvitation(
      invitation,
      {
      claim: async (id) => {
        assert.equal(id, 123);

        return {
          id,
          estado_entrega: "enviando",
        };
      },
        send: async () => {
          sendCount += 1;
        },
        record: async () => {
          recordCount += 1;
          throw new Error("ERROR_BD_SIMULADO");
        },
      }
    ),
    {
      message: "ERROR_BD_SIMULADO",
    }
  );

  assert.equal(sendCount, 1);
  assert.equal(recordCount, 1);
});

test("D31-14: no envía SMTP si la invitación no puede reclamarse", async () => {
  let sendCount = 0;
  let recordCount = 0;

  const result = await dispatchInvitation(
    invitation,
    {
      claim: async () => null,

      send: async () => {
        sendCount += 1;
      },

      record: async () => {
        recordCount += 1;
      },
    }
  );

  assert.deepEqual(result, {
    estadoEntrega: "no_disponible",
  });

  assert.equal(sendCount, 0);
  assert.equal(recordCount, 0);
});

test("D31-15: reclamación fallida no inicia envío", async () => {
  let sendCount = 0;

  await assert.rejects(
    dispatchInvitation(
      invitation,
      {
        claim: async () => {
          throw new Error("ERROR_BD_RECLAMO_SIMULADO");
        },

        send: async () => {
          sendCount += 1;
        },
      }
    ),
    {
      message: "ERROR_BD_RECLAMO_SIMULADO",
    }
  );

  assert.equal(sendCount, 0);
});
