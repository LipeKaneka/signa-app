import { useEffect, useMemo, useState } from "react";
import { carregarModelo } from "../../features/translator/engine/dinamicos.js";
import { evaluateAvatarAsReference, evaluateLetter, evaluateWord } from "./lab-evaluation.js";
import "./lab.css";

// Página de desenvolvimento (só em npm run dev): experimento VLibras × câmera. Ver docs/EXPERIMENTO-VLIBRAS-CAMERA.md.
const PLAYER_URL = "https://vlibras.gov.br/app/unity/index.html?v=7.12.2";
const PLAYER_ORIGIN = "https://vlibras.gov.br";
// Servido pelo Vite só em desenvolvimento (a pasta scripts/ não entra no build nem no APK).
const SAVED_URL = "/scripts/vlibras-lab/dados/avatar-pontos.json";
const RECEIVER_URL = "http://127.0.0.1:8765";

const percent = (value) => `${Math.round(value * 100)}%`;

/** Desfaz o pacote do extrator: base64url → gzip → JSON. */
async function unpack(packed) {
  const binary = atob(packed.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  return JSON.parse(text);
}

/** Glosa do VLibras de cada sinal do modelo de sinais com movimento (palavra em maiúsculas, com acento). */
const glossOf = (word) => word.toUpperCase();

export function LabPage() {
  const [records, setRecords] = useState({});
  const [model, setModel] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch(SAVED_URL, { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : { sinais: {} }))
      .then((data) => setRecords((current) => ({ ...data.sinais, ...current })))
      .catch(() => {});
    carregarModelo().then(setModel).catch((error) => setStatus(`Modelo de sinais: ${error.message}`));
  }, []);

  // Pacote vindo da aba do player (extrator-avatar.js → levarParaOApp): #/laboratorio?pacote=<gzip em base64url>.
  useEffect(() => {
    const packed = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("pacote");
    if (!packed) return;
    window.history.replaceState(null, "", "#/laboratorio");
    unpack(packed)
      .then(async ({ sinais }) => {
        setRecords((current) => ({ ...current, ...sinais }));
        const saved = await Promise.all(
          Object.entries(sinais).map(([glosa, record]) =>
            fetch(RECEIVER_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ glosa, ...record }) })
              .then((response) => response.ok)
              .catch(() => false),
          ),
        );
        setStatus(`${saved.length} sinais recebidos${saved.every(Boolean) ? " e salvos em disco" : " (receptor desligado: não foram salvos em disco)"}`);
      })
      .catch((error) => setStatus(`Pacote inválido: ${error.message}`));
  }, []);

  // Pontos chegando da janela do player (extrator-avatar.js) — só aceita mensagens do site do VLibras.
  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== PLAYER_ORIGIN || event.data?.tipo !== "signa-lab-pontos") return;
      const { glosa, largura, altura, quadros } = event.data;
      setRecords((current) => ({ ...current, [glosa]: { largura, altura, quadros } }));
      fetch(RECEIVER_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event.data) })
        .then(() => setStatus(`${glosa}: recebido e salvo`))
        .catch(() => setStatus(`${glosa}: recebido (receptor desligado, não foi salvo em disco)`));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const letterRecords = useMemo(() => Object.fromEntries(Object.entries(records).filter(([glosa]) => /^[A-ZÇ]$/.test(glosa))), [records]);
  const letters = useMemo(() => Object.entries(letterRecords).map(([glosa, record]) => evaluateLetter(glosa, record)), [letterRecords]);
  const reference = useMemo(() => (Object.keys(letterRecords).length >= 2 ? evaluateAvatarAsReference(letterRecords) : null), [letterRecords]);
  const words = useMemo(() => {
    if (!model) return [];
    return model.sinais
      .map((sign) => ({ sign, record: records[glossOf(sign.palavra)] }))
      .filter(({ record }) => record)
      .map(({ sign, record }) => evaluateWord(glossOf(sign.palavra), sign.palavra, record, model));
  }, [records, model]);

  const comparableLetters = letters.filter((letter) => letter.acertou !== null);
  const letterHits = comparableLetters.filter((letter) => letter.acertou).length;
  const wordHits = words.filter((word) => word.acertou).length;

  return (
    <main className="lab">
      <h1>Laboratório: VLibras × câmera</h1>
      <p>
        O avatar do VLibras sinaliza, o MediaPipe acha as mãos dele, e os modelos que o app usa na câmera tentam
        reconhecer o gesto.
      </p>
      <div className="lab__actions">
        <button type="button" onClick={() => window.open(PLAYER_URL, "vlibras-lab", "width=1100,height=860")}>Abrir player do VLibras</button>
        <span>{Object.keys(records).length} sinais gravados {status && `· ${status}`}</span>
      </div>

      <section>
        <h2>1. Letras do avatar → classificador de letras do app</h2>
        {comparableLetters.length > 0 && (
          <p className="lab__summary">
            {letterHits} de {comparableLetters.length} letras reconhecidas ({percent(letterHits / comparableLetters.length)}) · acaso: {percent(1 / comparableLetters.length)}
          </p>
        )}
        <table>
          <thead><tr><th>Letra</th><th>Mão achada</th><th>Quadros aceitos</th><th>Quadros certos</th><th>App viu</th></tr></thead>
          <tbody>
            {letters.map((row) => (
              <tr key={row.glosa} className={row.acertou === null ? "" : row.acertou ? "ok" : "erro"}>
                <td>{row.glosa}</td><td>{percent(row.deteccao)}</td><td>{percent(row.aceitos)}</td><td>{percent(row.acertosPorQuadro)}</td>
                <td>{row.acertou === null ? "sem fotos de pessoas para comparar" : row.previsto ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>2. Avatar como referência → fotos de pessoas (simula conferir alguém pela câmera)</h2>
        {reference && (
          <>
            <p className="lab__summary">
              {reference.acertos} de {reference.total} fotos reconhecidas ({percent(reference.taxa)}) usando só {reference.amostrasAvatar} quadros do
              avatar como referência · acaso: {percent(1 / Object.keys(letterRecords).length)}
            </p>
            <table>
              <thead><tr><th>Letra</th><th>Fotos</th><th>Reconhecidas</th></tr></thead>
              <tbody>
                {Object.entries(reference.porLetra).map(([letter, row]) => (
                  <tr key={letter}><td>{letter}</td><td>{row.total}</td><td>{percent(row.acertos / row.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section>
        <h2>3. Sinais com movimento do avatar → modelo de sinais do app (MINDS-Libras)</h2>
        {words.length > 0 && <p className="lab__summary">{wordHits} de {words.length} sinais reconhecidos ({percent(wordHits / words.length)}) · acaso: 5%</p>}
        <table>
          <thead><tr><th>Sinal</th><th>Quadros com mão</th><th>App viu</th><th>Confiança</th><th>3 mais parecidos</th></tr></thead>
          <tbody>
            {words.map((row) => (
              <tr key={row.glosa} className={row.acertou ? "ok" : "erro"}>
                <td>{row.palavra}</td><td>{row.comMao}/{row.quadros}</td><td>{row.previsto ?? "—"}</td><td>{percent(row.confianca)}</td>
                <td>{row.top.map((item) => `${item.palavra} ${percent(item.p)}`).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
