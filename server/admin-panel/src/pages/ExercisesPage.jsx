import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Field, LoadState, Notice, useAction, useLoad } from "../components/ui.jsx";
import { ModuleActivities } from "./TrailPage.jsx";
import { buildSignQuestions, loadAllSigns } from "../exercise-generator.js";

const MAX_QUESTIONS = 30;

/**
 * Criar exercício rápido: escolher sinais do dicionário → perguntas "Qual sinal é esse?" prontas, com as
 * alternativas sorteadas. Depois de criado, dá para ajustar tudo no editor.
 */
function SignExerciseCreator({ module, onCreated }) {
  const navigate = useNavigate();
  const signs = useLoad(loadAllSigns, []);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [optionCount, setOptionCount] = useState(4);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [chosen, setChosen] = useState([]);
  const { run, busy, message } = useAction();

  const all = signs.data ?? [];
  const categories = useMemo(() => [...new Set(all.map((sign) => sign.category))].sort((a, b) => a.localeCompare(b, "pt-BR")), [all]);
  const normalize = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visible = all.filter(
    (sign) => (!category || sign.category === category) && (!search || normalize(sign.word).includes(normalize(search))),
  );
  const isChosen = (sign) => chosen.some((item) => item.slug === sign.slug);
  const toggle = (sign) => setChosen((current) => (isChosen(sign) ? current.filter((item) => item.slug !== sign.slug) : [...current, sign]));
  const chooseVisible = () => setChosen((current) => [...current, ...visible.filter((sign) => !current.some((item) => item.slug === sign.slug))].slice(0, MAX_QUESTIONS));

  const create = (event) => {
    event.preventDefault();
    run(async () => {
      if (chosen.length === 0) throw new Error("Escolha pelo menos um sinal.");
      if (chosen.length > MAX_QUESTIONS) throw new Error(`No máximo ${MAX_QUESTIONS} perguntas por exercício.`);
      const questions = buildSignQuestions(chosen, all, Number(optionCount));
      const { activity } = await api("/activities", { method: "POST", body: { moduleId: module.id, title, description, questions } });
      setTitle("");
      setDescription("");
      setChosen([]);
      onCreated();
      if (window.confirm(`Exercício "${activity.title}" criado com ${questions.length} perguntas. Abrir para revisar?`)) {
        navigate(`/atividades/${activity.id}`);
      }
    }, "Exercício criado. Ele aparece no app em poucos segundos.");
  };

  return (
    <form className="card form" onSubmit={create}>
      <h2>Novo exercício em "{module.title}"</h2>
      <p className="muted">Escolha os sinais: cada um vira uma pergunta "Qual sinal é esse?" com o avatar fazendo o sinal e
        alternativas sorteadas (de preferência da mesma categoria). Depois você pode ajustar no editor.</p>
      <div className="form__row">
        <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="Ex.: Cores básicas" /></Field>
        <Field label="Alternativas por pergunta">
          <select value={optionCount} onChange={(e) => setOptionCount(e.target.value)}>
            {[2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Descrição" hint="Aparece no cartão da unidade, no app.">
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
      </Field>

      <div className="sign-picker">
        <div className="filters">
          <input type="search" placeholder="Buscar sinal" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <button type="button" className="button button--ghost" onClick={chooseVisible} disabled={visible.length === 0}>Marcar os da lista</button>
          {chosen.length > 0 && <button type="button" className="button button--ghost" onClick={() => setChosen([])}>Limpar</button>}
        </div>
        <LoadState loading={signs.loading && !signs.data} error={signs.error} onRetry={signs.reload} />
        <div className="sign-picker__grid">
          {visible.map((sign) => (
            <label key={sign.slug} className={`sign-chip${isChosen(sign) ? " sign-chip--on" : ""}`}>
              <input type="checkbox" checked={isChosen(sign)} onChange={() => toggle(sign)} />
              {sign.word}
              <small>{sign.category}</small>
            </label>
          ))}
        </div>
        <p className="field__hint">
          {chosen.length} {chosen.length === 1 ? "sinal escolhido" : "sinais escolhidos"} (máx. {MAX_QUESTIONS})
          {chosen.length > 0 && `: ${chosen.map((sign) => sign.word).join(", ")}`}
        </p>
      </div>

      <Notice message={message} />
      <div className="form__actions">
        <Link className="button button--ghost" to={`/atividades/nova?module=${module.id}`}>Montar perguntas à mão</Link>
        <button className="button" disabled={busy}>{busy ? "Criando…" : `Criar exercício (${chosen.length})`}</button>
      </div>
    </form>
  );
}

/**
 * Exercícios por módulo: escolha o módulo na seleção, veja os exercícios dele (ordem, ativar, editar, excluir)
 * e crie novos a partir dos sinais do dicionário.
 */
export function ExercisesPage() {
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const modules = useLoad(() => api("/modules"), []);
  const [tick, setTick] = useState(0);
  const list = modules.data?.modules ?? [];
  const selectedId = searchParams.get("modulo") ?? list[0]?.id ?? "";
  const selected = list.find((module) => module.id === selectedId);

  return (
    <section>
      <h1>Exercícios</h1>
      <LoadState loading={modules.loading && !modules.data} error={modules.error} onRetry={modules.reload} />
      {modules.data && list.length === 0 && <p className="muted">Crie um módulo em <Link to="/trilha">Trilha</Link> primeiro.</p>}
      {list.length > 0 && (
        <div className="card">
          <Field label="Módulo" hint="Escolha o módulo para ver e criar os exercícios dele.">
            <select value={selectedId} onChange={(e) => setSearchParams({ modulo: e.target.value })}>
              {list.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.order}. {module.icon} {module.title} — {module.activityCount} exercício(s){module.active ? "" : " (desativado)"}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {selected && (
        <>
          <ModuleActivities key={`${selected.id}-${tick}`} module={selected} onChanged={modules.reload} />
          {can("content") && (
            <SignExerciseCreator
              key={selected.id}
              module={selected}
              onCreated={() => {
                setTick((value) => value + 1);
                modules.reload();
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
