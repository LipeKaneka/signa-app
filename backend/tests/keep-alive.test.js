import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_HOURS, hourInBrazil, isWithinHours, nextDelay, parseHours, shouldPing, startKeepAlive } from "../src/services/keep-alive.js";

// Robô "mantém acordado": janela de horário, intervalo sorteado e quando ele NÃO cutuca.

test("janela de horário: normal, atravessando a meia-noite, e valor inválido vira o padrão", () => {
  assert.deepEqual(parseHours("8-20"), { start: 8, end: 20 });
  assert.deepEqual(parseHours("0-24"), { start: 0, end: 24 });
  assert.deepEqual(parseHours("abc"), parseHours(DEFAULT_HOURS));
  assert.deepEqual(parseHours("5-5"), parseHours(DEFAULT_HOURS));
  assert.equal(isWithinHours(8, { start: 8, end: 20 }), true);
  assert.equal(isWithinHours(20, { start: 8, end: 20 }), false);
  assert.equal(isWithinHours(23, { start: 22, end: 6 }), true);
  assert.equal(isWithinHours(3, { start: 22, end: 6 }), true);
  assert.equal(isWithinHours(12, { start: 22, end: 6 }), false);
});

test("hora de Brasília não depende do fuso da máquina", () => {
  assert.equal(hourInBrazil(new Date("2026-11-22T15:30:00Z")), 12);
  assert.equal(hourInBrazil(new Date("2026-11-22T02:10:00Z")), 23);
});

test("intervalo sorteado entre 7 e 13 min (abaixo da soneca de 15) e espera mais quando falha", () => {
  assert.equal(nextDelay(0, () => 0), 7 * 60 * 1000);
  assert.equal(nextDelay(0, () => 1), 13 * 60 * 1000);
  const delays = new Set(Array.from({ length: 20 }, () => nextDelay()));
  assert.ok(delays.size > 1, "intervalos repetidos");
  assert.equal(nextDelay(1, () => 0), 14 * 60 * 1000);
  assert.equal(nextDelay(5, () => 1), 30 * 60 * 1000);
});

test("só cutuca dentro da janela e quando não teve uso de verdade há pouco", () => {
  const noon = new Date("2026-11-22T15:00:00Z").getTime(); // 12h em Brasília
  const hours = { start: 8, end: 20 };
  assert.equal(shouldPing({ now: noon, hours, lastActivity: 0 }), true);
  assert.equal(shouldPing({ now: noon, hours, lastActivity: noon - 30 * 1000 }), false);
  // Uso há 2 min: cutuca (pular aqui deixaria até 15 min sem pedido e o Render dormiria).
  assert.equal(shouldPing({ now: noon, hours, lastActivity: noon - 2 * 60 * 1000 }), true);
  assert.equal(shouldPing({ now: new Date("2026-11-22T05:00:00Z").getTime(), hours, lastActivity: 0 }), false); // 2h
});

test("não liga fora de produção, sem endereço público ou com KEEP_ALIVE=0", () => {
  const saved = { ...process.env };
  try {
    process.env.RENDER_EXTERNAL_URL = "https://exemplo.invalid";
    assert.equal(startKeepAlive({ nodeEnv: "test" }), false);
    process.env.KEEP_ALIVE = "0";
    assert.equal(startKeepAlive({ nodeEnv: "production" }), false);
    delete process.env.KEEP_ALIVE;
    delete process.env.RENDER_EXTERNAL_URL;
    delete process.env.KEEP_ALIVE_URL;
    assert.equal(startKeepAlive({ nodeEnv: "production" }), false);
  } finally {
    process.env = saved;
  }
});
