/**
 * Cache em memória com validade curta, para dados que mudam pouco (regras, catálogo de conquistas, níveis,
 * eventos). Evita uma consulta ao banco a cada atividade concluída.
 * Quem altera os dados (painel, seed) chama clear() para a mudança valer na hora; sem isso, vale em até ttlMs.
 * @param {number} ttlMs - validade de cada valor.
 * @returns {{get: (key: string, load: () => Promise<any>) => Promise<any>, clear: () => void}}
 * Usado por: service-settings, service-achievement, service-level, service-event.
 */
export function createTimedCache(ttlMs) {
  const entries = new Map();
  return {
    async get(key, load) {
      const entry = entries.get(key);
      if (entry && Date.now() - entry.storedAt < ttlMs) return entry.value;
      const value = await load();
      entries.set(key, { value, storedAt: Date.now() });
      return value;
    },
    clear() {
      entries.clear();
    },
  };
}
