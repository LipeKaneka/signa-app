import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHistory } from "../src/services/service-chat.js";

test("histórico do assistente: começa pela pessoa, alterna e termina na IA", () => {
  // Fora de passo: começa com a IA e tem uma pergunta que ficou sem resposta no meio e no fim.
  const history = [
    { role: "assistant", content: "resposta antiga" },
    { role: "user", content: "pergunta 1" },
    { role: "user", content: "pergunta 1 de novo" },
    { role: "assistant", content: "resposta 1" },
    { role: "user", content: "pergunta sem resposta" },
  ];
  assert.deepEqual(normalizeHistory(history), [
    { role: "user", content: "pergunta 1\npergunta 1 de novo" },
    { role: "assistant", content: "resposta 1" },
  ]);
});

test("histórico vazio ou só com mensagens vazias vira lista vazia", () => {
  assert.deepEqual(normalizeHistory([]), []);
  assert.deepEqual(normalizeHistory([{ role: "user", content: "  " }, { role: "assistant", content: "" }]), []);
});
