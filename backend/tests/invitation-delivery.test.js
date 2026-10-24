
import test from "node:test";
import assert from "node:assert/strict";

import {
  claimInvitationDelivery,
  recordInvitationDelivery,
} from "../src/modules/invitations/invitation.delivery.js";

test("D31-07: registra envío SMTP aceptado", async () => {
  let capturedSql;
  let capturedParams;

  const fakeQuery = async (sql, params) => {
    capturedSql = sql;
    capturedParams = params;

    return {
      rowCount: 1,
      rows: [{
        id: "123",
        estado_entrega: "enviado",
        intentos_entrega: 1,
      }],
    };
  };

  const result = await recordInvitationDelivery(
    123,
    true,
    { query: fakeQuery }
  );

  assert.deepEqual(capturedParams, [123, true]);
  assert.match(capturedSql, /intentos_entrega \+ 1/);
  assert.match(capturedSql, /estado = 'pendiente'/);
  assert.match(
    capturedSql,
    /estado_entrega = 'enviando'/
  );

  assert.equal(result.estado_entrega, "enviado");
  assert.equal(result.intentos_entrega, 1);
});

test("D31-08: rechaza registrar una entrega no disponible", async () => {
  const fakeQuery = async () => ({
    rowCount: 0,
    rows: [],
  });

  await assert.rejects(
    recordInvitationDelivery(
      123,
      false,
      { query: fakeQuery }
    ),
    {
      message:
        "Invitación no disponible para registrar entrega",
    }
  );
});

test("D31-12: una invitación solo puede reclamarse una vez", async () => {
  let state = "pendiente";
  let successfulClaims = 0;

  const fakeQuery = async (sql, params) => {
    assert.match(sql, /estado_entrega = 'enviando'/);
    assert.match(sql, /estado_entrega = 'pendiente'/);
    assert.deepEqual(params, [123]);

    if (state !== "pendiente") {
      return {
        rowCount: 0,
        rows: [],
      };
    }

    state = "enviando";
    successfulClaims += 1;

    return {
      rowCount: 1,
      rows: [{
        id: 123,
        estado_entrega: "enviando",
      }],
    };
  };

  const firstClaim = await claimInvitationDelivery(
    123,
    { query: fakeQuery }
  );

  const secondClaim = await claimInvitationDelivery(
    123,
    { query: fakeQuery }
  );

  assert.equal(firstClaim.estado_entrega, "enviando");
  assert.equal(secondClaim, null);
  assert.equal(successfulClaims, 1);
});

test("D31-13: el registro requiere una entrega reclamada", async () => {
  let queryExecuted = false;

  const fakeQuery = async (sql, params) => {
    queryExecuted = true;

    assert.match(
      sql,
      /estado_entrega = 'enviando'/
    );

    assert.deepEqual(params, [123, true]);

    // Simula que la invitación no estaba en "enviando".
    return {
      rowCount: 0,
      rows: [],
    };
  };

  await assert.rejects(
    recordInvitationDelivery(
      123,
      true,
      { query: fakeQuery }
    ),
    {
      message:
        "Invitación no disponible para registrar entrega",
    }
  );

  assert.equal(queryExecuted, true);
});
