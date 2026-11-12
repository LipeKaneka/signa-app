import { useCallback, useEffect, useState } from "react";
import * as ContentApi from "../../api/api-content.js";
import { useAsyncData } from "../../hooks/useAsyncData.js";
import { ErrorState, LoadingState, ScreenWithNav } from "../../components/layout.jsx";
import { Icon } from "../../components/Icon.jsx";
import { SignLanguageHands } from "../../components/illustrations.jsx";
import { SignDialog } from "../../components/SignDialog.jsx";
import { useAppEvents } from "../../features/achievements/AppEventsContext.jsx";
import "./dictionary.css";

const SEARCH_DELAY_MS = 300;

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function FeaturedEntry() {
  return (
    <section className="dictionary-featured">
      <SignLanguageHands size={116} />
      <div>
        <h2 className="dictionary-featured__title">“Libras”</h2>
        <p className="dictionary-featured__text">
          Libras significa Língua Brasileira de Sinais, um idioma oficial de modalidade gestual-visual usado para a
          comunicação com pessoas surdas no Brasil.
        </p>
        <p className="dictionary-featured__source">Esse dicionário só é válido em São Paulo - Brasil</p>
      </div>
    </section>
  );
}

function SignList({ signs, onOpen }) {
  if (signs.length === 0) return <p className="dictionary-empty">Nenhum sinal encontrado.</p>;
  return (
    <ul className="sign-list">
      {signs.map((sign) => (
        <li key={sign.slug}>
          <button type="button" className="sign-list__item" onClick={() => onOpen(sign)}>
            {sign.word}
            <Icon name="chevronRight" size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function CategoryAccordion({ category, onOpenSign }) {
  const [expanded, setExpanded] = useState(false);
  const [signs, setSigns] = useState(null);
  const [error, setError] = useState("");

  async function toggle() {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (!willExpand || signs) return;
    try {
      const result = await ContentApi.searchDictionary({ category });
      setSigns(result.signs);
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  return (
    <li className="category">
      <button type="button" className="category__header" onClick={toggle} aria-expanded={expanded}>
        {category}
        <Icon name="chevronDown" size={20} />
      </button>
      {expanded && (
        <div className="category__content">
          {error && <p className="form-error">{error}</p>}
          {!signs && !error && <LoadingState />}
          {signs && <SignList signs={signs} onOpen={onOpenSign} />}
        </div>
      )}
    </li>
  );
}

export function DictionaryPage() {
  const [search, setSearch] = useState("");
  const [openSign, setOpenSignState] = useState(null);
  const { trackSignView } = useAppEvents();
  // Cada sinal aberto conta para as conquistas "ver X sinais" e "ver o dicionário todo".
  const setOpenSign = useCallback((sign) => {
    if (sign?.slug) trackSignView(sign.slug);
    setOpenSignState(sign);
  }, [trackSignView]);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DELAY_MS);

  const categories = useAsyncData(ContentApi.fetchDictionaryCategories, [], { cacheKey: "dictionary:categories" });
  const loadResults = useCallback(
    () => (debouncedSearch ? ContentApi.searchDictionary({ search: debouncedSearch }) : Promise.resolve(null)),
    [debouncedSearch],
  );
  const results = useAsyncData(loadResults, [loadResults], { cacheKey: debouncedSearch ? `dictionary:search:${debouncedSearch.toLowerCase()}` : null });

  return (
    <ScreenWithNav
      title="Dicionário"
      backTo={-1}
      headerRounded
      headerClassName="dictionary-header"
      contentClassName="dictionary-content"
      headerContent={
        <label className="dictionary-search">
          <Icon name="search" size={14} strokeWidth={2.4} />
          <span className="visually-hidden">Buscar sinal</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar sinal" />
        </label>
      }
    >

      {debouncedSearch ? (
        <>
          {results.loading && <LoadingState />}
          {results.error && <ErrorState message={results.error.message} onRetry={results.reload} />}
          {results.data && <SignList signs={results.data.signs} onOpen={setOpenSign} />}
        </>
      ) : (
        <>
          <FeaturedEntry />
          {categories.error && <ErrorState message={categories.error.message} onRetry={categories.reload} />}
          <ul className="category-list">
            {categories.data?.categories.map((category) => (
              <CategoryAccordion key={category} category={category} onOpenSign={setOpenSign} />
            ))}
          </ul>
        </>
      )}

      {openSign && (
        <SignDialog
          word={openSign.word}
          description={openSign.description || openSign.category}
          avatar={openSign.avatar}
          onClose={() => setOpenSign(null)}
        />
      )}
    </ScreenWithNav>
  );
}
