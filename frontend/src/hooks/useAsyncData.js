import { useCallback, useEffect, useRef, useState } from "react";
import { readCache, writeCache } from "../utils/data-cache.js";

/**
 * Carrega dados assíncronos com estados de carregando/erro e recarregar; ignora respostas que chegam
 * depois de a tela trocar.
 * Com options.cacheKey, mostra na hora os últimos dados guardados no aparelho (sem "carregando") e atualiza em
 * segundo plano; se a atualização falhar, continua com os guardados (sem tela de erro).
 * @param {() => Promise<T>} loader - função que busca os dados (estável ou listada em deps).
 * @param {unknown[]} [deps]
 * @param {{cacheKey?: string|null}} [options]
 * @returns {{data: T|null, error: Error|null, loading: boolean, refreshing: boolean, reload: () => void, setData: Function}}
 *   refreshing = mostrando dados guardados enquanto busca os novos.
 * Usado por: Trilha, Módulo, Atividade, Perfil, Conquistas, Ranking, Dicionário.
 */
export function useAsyncData(loader, deps = [], { cacheKey = null } = {}) {
  const [data, setDataState] = useState(() => (cacheKey ? readCache(cacheKey) ?? null : null));
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(() => !(cacheKey && readCache(cacheKey) !== undefined));
  const [refreshing, setRefreshing] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const keyRef = useRef(cacheKey);
  keyRef.current = cacheKey;

  useEffect(() => {
    let active = true;
    const cached = cacheKey ? readCache(cacheKey) : undefined;
    if (cached !== undefined) {
      setDataState(cached);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    loader()
      .then((result) => {
        if (!active) return;
        setDataState(result);
        if (cacheKey) writeCache(cacheKey, result);
      })
      .catch((loadError) => {
        // Com dados guardados na tela, a falha não apaga nada (ex.: sem internet ou servidor acordando).
        if (active && cached === undefined) setError(loadError);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, cacheKey, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);
  /** Mudança feita na própria tela (ex.: perfil editado): vale também para os dados guardados. */
  const setData = useCallback((update) => {
    setDataState((current) => {
      const next = typeof update === "function" ? update(current) : update;
      if (keyRef.current) writeCache(keyRef.current, next);
      return next;
    });
  }, []);
  return { data, error, loading, refreshing, reload, setData };
}
