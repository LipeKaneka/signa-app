import { test } from "node:test";
import assert from "node:assert/strict";
import {
  notesFromReleaseBody,
  versionCodeFromBody,
  versionCodeFromHistory,
  versionNameFromTag,
} from "../src/services/service-github-release.js";

// "Buscar no GitHub" do painel: como a release vira os campos de "Atualização do app".
test("tag → nome da versão no formato do APK", () => {
  assert.equal(versionNameFromTag("v1.4.0"), "1.4");
  assert.equal(versionNameFromTag("v1.4.2"), "1.4.2");
  assert.equal(versionNameFromTag("1.5"), "1.5");
  assert.equal(versionNameFromTag("beta"), "");
});

test("versionCode lido da descrição ou do HISTORICO.md", () => {
  assert.equal(versionCodeFromBody("Novidades\n\nversionCode: 5"), 5);
  assert.equal(versionCodeFromBody("**versionCode** 7"), 7); // negrito do markdown também vale
  assert.equal(versionCodeFromBody("- versionCode = 9"), 9);
  assert.equal(versionCodeFromBody("sem número"), null);
  const history = "| Versão | Data | versionCode | Tag | O que mudou |\n|---|---|---|---|---|\n| **1.4.0** | 12/11/2026 | 5 | `v1.4.0` | x |\n| **1.3.0** | 11/11/2026 | 4 | `v1.3.0` | y |";
  assert.equal(versionCodeFromHistory(history, "1.3.0"), 4);
  assert.equal(versionCodeFromHistory(history, "1.4.0"), 5);
  assert.equal(versionCodeFromHistory(history, "2.0.0"), null);
});

test("novidades: sem a linha do versionCode, sem títulos markdown e com limite de tamanho", () => {
  assert.equal(notesFromReleaseBody("## Novidades\n**Trilha** decorada\n\n\n\nversionCode: 5\n"), "Novidades\nTrilha decorada");
  assert.equal(notesFromReleaseBody("x".repeat(700)).length, 600);
});
