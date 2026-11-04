import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Field, LoadState, Notice, useAction, useLoad } from "../components/ui.jsx";

const TYPE_LABELS = {
  sign_choice: "Qual sinal é esse? (avatar faz o sinal)",
  single_choice: "Múltipla escolha (texto)",
  true_false: "Verdadeiro ou falso",
  camera_sign: "Faça o sinal pela câmera (o app confere)",
};
const OPTION_IDS = ["a", "b", "c", "d", "e", "f"];

/** Pergunta nova no formato que o editor usa. */
function blankQuestion(type = "sign_choice") {
  if (type === "camera_sign") {
    // Alternativas e gabarito são fixos no servidor ("Fiz o sinal" / "Pular").
    return { type, prompt: "Faça o sinal para a câmera", signSlug: "", target: "", options: [], correctOptionId: "done", explanation: "" };
  }
  if (type === "true_false") {
    return { type, prompt: "", signSlug: "", options: [{ id: "a", text: "Verdadeiro" }, { id: "b", text: "Falso" }], correctOptionId: "a", explanation: "" };
  }
  return {
    type,
    prompt: type === "sign_choice" ? "Qual sinal é esse?" : "",
    signSlug: "",
    options: OPTION_IDS.slice(0, 4).map((id) => ({ id, text: "" })),
    correctOptionId: "a",
    explanation: "",
  };
}

/** Lista de sinais para o campo de escolha (busca no dicionário). */
function useSignOptions(search) {
  const [signs, setSigns] = useState([]);
  useEffect(() => {
    const timer = setTimeout(() => {
      api("/signs", { query: { search, limit: 30 } }).then((data) => setSigns(data.signs)).catch(() => setSigns([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  return signs;
}

/** Sinais que o app reconhece pela câmera (letras paradas e palavras), carregados uma vez. */
let cameraTargetsPromise = null;
function useCameraTargets() {
  const [targets, setTargets] = useState([]);
  useEffect(() => {
    cameraTargetsPromise ??= api("/camera-targets").then((data) => data.targets).catch(() => {
      cameraTargetsPromise = null;
      return [];
    });
    cameraTargetsPromise.then(setTargets);
  }, []);
  return targets;
}

/** Campo do sinal-alvo de uma pergunta de câmera: só aparecem os sinais que o reconhecedor do app sabe conferir. */
function CameraTargetField({ question, set }) {
  const targets = useCameraTargets();
  const letters = targets.filter((target) => target.kind === "letter");
  const words = targets.filter((target) => target.kind === "word");
  const chooseTarget = (label) => {
    const target = targets.find((item) => item.label === label);
    const prompt = !target ? question.prompt : target.kind === "letter" ? `Faça a letra ${label} para a câmera` : `Faça o sinal de "${label}" para a câmera`;
    set({ target: label, prompt });
  };
  return (
    <Field label="Sinal que a pessoa deve fazer" hint="Só sinais que o app reconhece. Letras: mão parada. Palavras: começar e terminar com as mãos abaixadas. Se o dicionário tiver o mesmo sinal, o app mostra o avatar em “Ver o sinal”.">
      <select value={question.target ?? ""} onChange={(e) => chooseTarget(e.target.value)} required>
        <option value="" disabled>Escolha o sinal</option>
        <optgroup label="Letras (mão parada)">
          {letters.map((target) => <option key={target.label} value={target.label}>{target.label}</option>)}
        </optgroup>
        <optgroup label="Palavras (com movimento)">
          {words.map((target) => <option key={target.label} value={target.label}>{target.label}</option>)}
        </optgroup>
      </select>
    </Field>
  );
}

/** Editor de uma pergunta. */
function QuestionEditor({ question, index, total, onChange, onRemove, onMove }) {
  const signs = useSignOptions(question.signSlug);
  const listId = `signs-${index}`;
  const set = (changes) => onChange({ ...question, ...changes });
  const setOption = (optionIndex, text) => set({ options: question.options.map((option, i) => (i === optionIndex ? { ...option, text } : option)) });
  const addOption = () => set({ options: [...question.options, { id: OPTION_IDS[question.options.length], text: "" }] });
  const removeOption = (optionIndex) => {
    const options = question.options.filter((_, i) => i !== optionIndex).map((option, i) => ({ ...option, id: OPTION_IDS[i] }));
    set({ options, correctOptionId: options.some((option) => option.id === question.correctOptionId) ? question.correctOptionId : "a" });
  };

  return (
    <fieldset className="question">
      <legend>Pergunta {index + 1}</legend>
      <div className="toolbar toolbar--compact">
        <select value={question.type} onChange={(e) => onChange({ ...blankQuestion(e.target.value), signSlug: question.signSlug })}>
          {Object.entries(TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
        </select>
        <span>
          <button type="button" className="icon-button" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Subir">↑</button>
          <button type="button" className="icon-button" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Descer">↓</button>
          <button type="button" className="button button--ghost" disabled={total === 1} onClick={onRemove}>Remover</button>
        </span>
      </div>
      <Field label="Enunciado"><input value={question.prompt} onChange={(e) => set({ prompt: e.target.value })} maxLength={500} required /></Field>
      {question.type === "camera_sign" && <CameraTargetField question={question} set={set} />}
      {question.type === "sign_choice" && (
        <Field label="Sinal (identificador do dicionário)" hint="Digite para buscar; o avatar VLibras faz este sinal.">
          <input list={listId} value={question.signSlug} onChange={(e) => set({ signSlug: e.target.value })} required />
          <datalist id={listId}>
            {signs.map((sign) => <option key={sign.slug} value={sign.slug}>{sign.word}</option>)}
          </datalist>
        </Field>
      )}
      {question.type !== "camera_sign" && <div className="options">
        <span className="field__label">Alternativas (marque a correta)</span>
        {question.options.map((option, optionIndex) => (
          <div className="option" key={option.id}>
            <input type="radio" name={`correct-${index}`} checked={question.correctOptionId === option.id} onChange={() => set({ correctOptionId: option.id })} aria-label={`Alternativa ${option.id} correta`} />
            <input value={option.text} onChange={(e) => setOption(optionIndex, e.target.value)} maxLength={200} required readOnly={question.type === "true_false"} />
            {question.type !== "true_false" && question.options.length > 2 && (
              <button type="button" className="icon-button" onClick={() => removeOption(optionIndex)} aria-label="Remover alternativa">×</button>
            )}
          </div>
        ))}
        {question.type !== "true_false" && question.options.length < OPTION_IDS.length && (
          <button type="button" className="link" onClick={addOption}>+ alternativa</button>
        )}
      </div>}
      <Field label="Explicação (aparece depois da resposta)">
        <input value={question.explanation} onChange={(e) => set({ explanation: e.target.value })} maxLength={1000} />
      </Field>
    </fieldset>
  );
}

/** Criar ou editar uma atividade e suas perguntas. */
export function ActivityEditorPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [activity, setActivity] = useState(id ? null : { title: "", description: "", questionsPerAttempt: null, moduleId: searchParams.get("module"), active: true, questions: [blankQuestion()] });
  const [loadError, setLoadError] = useState(null);
  const { run, busy, message } = useAction();
  const modules = useLoad(() => api("/modules"), []);

  useEffect(() => {
    if (!id) return;
    api(`/activities/${id}`)
      .then(({ activity: loaded }) =>
        setActivity({ ...loaded, questions: loaded.questions.map((question) => ({ ...question, signSlug: question.sign?.slug ?? "" })) }),
      )
      .catch((error) => setLoadError(error.message));
  }, [id]);

  if (!activity) return <LoadState loading={!loadError} error={loadError} onRetry={() => window.location.reload()} />;

  const setQuestion = (index, question) => setActivity({ ...activity, questions: activity.questions.map((q, i) => (i === index ? question : q)) });
  const moveQuestion = (index, direction) => {
    const questions = [...activity.questions];
    [questions[index], questions[index + direction]] = [questions[index + direction], questions[index]];
    setActivity({ ...activity, questions });
  };

  const submit = (event) => {
    event.preventDefault();
    const questions = activity.questions.map(({ key, type, prompt, signSlug, options, correctOptionId, explanation, target }) => ({
      key, type, prompt, signSlug, options, correctOptionId, explanation, ...(type === "camera_sign" ? { target } : {}),
    }));
    run(async () => {
      if (id) {
        const { activity: saved } = await api(`/activities/${id}`, { method: "PATCH", body: { title: activity.title, description: activity.description ?? "", questionsPerAttempt: activity.questionsPerAttempt || null, questions } });
        setActivity({ ...saved, questions: saved.questions.map((question) => ({ ...question, signSlug: question.sign?.slug ?? "" })) });
      } else {
        const { activity: saved } = await api("/activities", { method: "POST", body: { moduleId: activity.moduleId, title: activity.title, description: activity.description ?? "", questionsPerAttempt: activity.questionsPerAttempt || null, questions } });
        navigate(`/atividades/${saved.id}`, { replace: true });
      }
    }, "Atividade salva. O app recebe a versão nova em poucos segundos.");
  };

  return (
    <section>
      <p><Link to={activity.moduleId ? `/exercicios?modulo=${activity.moduleId}` : "/exercicios"}>← Exercícios</Link></p>
      <h1>{id ? "Editar atividade" : "Nova atividade"}</h1>
      {id && <p className="muted">Mudar perguntas não altera o progresso de quem já concluiu a atividade.</p>}
      <form className="form" onSubmit={submit}>
        <fieldset disabled={!can("content")} className="plain-fieldset">
          <Field label="Módulo" hint={id ? "O módulo de um exercício já criado não muda." : "Em qual módulo o exercício vai aparecer."}>
            <select value={activity.moduleId ?? ""} disabled={Boolean(id)} onChange={(e) => setActivity({ ...activity, moduleId: e.target.value })} required>
              <option value="" disabled>Escolha o módulo</option>
              {(modules.data?.modules ?? []).map((module) => (
                <option key={module.id} value={module.id}>{module.order}. {module.icon} {module.title}</option>
              ))}
            </select>
          </Field>
          <Field label="Título"><input value={activity.title} onChange={(e) => setActivity({ ...activity, title: e.target.value })} maxLength={120} required /></Field>
          <Field label="Descrição" hint="Aparece no cartão da unidade, no app.">
            <input value={activity.description ?? ""} onChange={(e) => setActivity({ ...activity, description: e.target.value })} maxLength={200} />
          </Field>
          <Field label="Perguntas sorteadas por tentativa" hint="Vazio = todas, na ordem abaixo. Com um número, cada tentativa sorteia essa quantidade em ordem aleatória.">
            <input
              type="number"
              min={1}
              max={30}
              value={activity.questionsPerAttempt ?? ""}
              onChange={(e) => setActivity({ ...activity, questionsPerAttempt: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </Field>
          {activity.questions.map((question, index) => (
            <QuestionEditor
              key={index}
              question={question}
              index={index}
              total={activity.questions.length}
              onChange={(changed) => setQuestion(index, changed)}
              onRemove={() => setActivity({ ...activity, questions: activity.questions.filter((_, i) => i !== index) })}
              onMove={(direction) => moveQuestion(index, direction)}
            />
          ))}
          <button type="button" className="button button--ghost" onClick={() => setActivity({ ...activity, questions: [...activity.questions, blankQuestion()] })}>
            + pergunta
          </button>
          <Notice message={message} />
          <div className="form__actions">
            <button className="button" disabled={busy}>{busy ? "Salvando…" : "Salvar atividade"}</button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
