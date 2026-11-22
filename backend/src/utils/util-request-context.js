import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Dados do pedido do app que valem até o fim dele, sem passar de função em função: hoje, a versão da sessão do token.
 * O server-client manda essa versão ao servidor (X-Session-Version), que recusa tokens de antes da última troca de senha.
 */
const storage = new AsyncLocalStorage();

/**
 * Roda o resto do pedido (next) com o contexto.
 * @param {{sessionVersion: number}} context
 * @param {() => void} callback
 * Usado por: auth-middleware.js.
 */
export function runWithRequestContext(context, callback) {
  return storage.run(context, callback);
}

/** @returns {{sessionVersion: number}|undefined} contexto do pedido atual (fora de um pedido com token: undefined). */
export function readRequestContext() {
  return storage.getStore();
}
