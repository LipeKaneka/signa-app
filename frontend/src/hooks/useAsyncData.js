import { useCallback, useEffect, useState } from "react";

/**
 * Carrega dados assíncronos com estados de carregando/erro e recarregar; ignora respostas que chegam
 * depois de a tela trocar.
 * @param {() => Promise<T>} loader - função que busca os dados (estável ou listada em deps).
 * @param {unknown[]} [deps]
 * @returns {{data: T|null, error: Error|null, loading: boolean, reload: () => void, setData: Function}}
 * Usado por: Trilha, Atividade, Perfil, Ranking, Dicionário.
 */
export function useAsyncData(loader, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loader()
      .then((result) => active && setData(result))
      .catch((loadError) => active && setError(loadError))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);
  return { data, error, loading, reload, setData };
}
