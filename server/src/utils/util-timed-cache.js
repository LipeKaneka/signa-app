/**
 * Cache em memória com validade curta, para dados que mudam pouco (regras, catálogo de conquistas, níveis,
 * eventos, trilha). Evita uma consulta ao banco a cada atividade concluída.
 * Quem altera os dados (painel, seed) chama clear() para a mudança valer na hora; sem isso, vale em até ttlMs.
 * Pedidos ao mesmo tempo para uma chave vencida esperam a MESMA busca (antes, cada um ia ao banco).
 * @param {number} ttlMs - validade de cada valor.
 * @returns {{get: (key: string, load: () => Promise<any>) => Promise<any>, clear: () => void}}
 * Usado por: service-settings, service-achievement, service-level, service-event, service-trail, service-notification.
 */
export function createTimedCache(ttlMs) {
  const entries = new Map();
  const pending = new Map();
  let generation = 0;
  return {
    get(key, load) {
      const entry = entries.get(key);
      if (entry && Date.now() - entry.storedAt < ttlMs) return Promise.resolve(entry.value);
      if (pending.has(key)) return pending.get(key);
      const startedIn = generation;
      const loading = Promise.resolve()
        .then(load)
        .then((value) => {
          // Um clear() durante a busca descarta o resultado (pode ser anterior à mudança).
          if (startedIn === generation) entries.set(key, { value, storedAt: Date.now() });
          return value;
        })
        .finally(() => pending.delete(key));
      pending.set(key, loading);
      return loading;
    },
    clear() {
      generation += 1;
      entries.clear();
      pending.clear();
    },
  };
}
