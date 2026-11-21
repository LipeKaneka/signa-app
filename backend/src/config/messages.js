/**
 * TODAS as mensagens que o backend devolve ao app: erros, avisos de limite, respostas de sucesso e as respostas do
 * assistente quando a IA não responde. Para mudar um texto, mude só aqui (o código usa estas chaves).
 * Mensagens com partes variáveis são funções (ex.: MESSAGES.validation.tooLong("o apelido", 60)).
 * Erros de regra (atividade bloqueada, tentativa expirada...) vêm do servidor: veja server/src/config/messages.js.
 */
export const MESSAGES = Object.freeze({
  /** Respostas genéricas e falhas de comunicação com o servidor de gerenciamento. */
  general: Object.freeze({
    routeNotFound: "Rota não encontrada.",
    internalError: "Erro interno. Tente novamente mais tarde.",
    invalidJson: "JSON inválido.",
    loginRequired: "Faça login para continuar.",
    forbidden: "Você não tem permissão para isso.",
    notFound: "Não encontrado.",
    serverUnavailable: "Serviço temporariamente indisponível. Tente de novo em instantes.",
    /** Quando o servidor recusa sem explicar (erro 4xx sem {error}). */
    operationFailed: "Não foi possível concluir a operação.",
    /**
     * Texto que o SERVIDOR manda quando a chave de serviço não confere (server/src/config/messages.js,
     * general.invalidServiceKey). Não aparece para a pessoa: serve para reconhecer o erro. Mude nos dois juntos.
     */
    serverServiceKeyRejected: "Chave de serviço inválida.",
  }),

  /** Limites de requisições (429). */
  rateLimit: Object.freeze({
    auth: "Muitas tentativas. Aguarde alguns minutos.",
    chat: "Muitas perguntas seguidas. Aguarde um minuto.",
    api: "Muitas requisições. Aguarde um pouco.",
  }),

  /** Validação dos dados enviados pelo app. fieldLabel = "o apelido", "Cidade"... */
  validation: Object.freeze({
    required: (fieldLabel) => `Informe ${fieldLabel}.`,
    tooLong: (fieldLabel, maxLength) => `${fieldLabel} pode ter no máximo ${maxLength} caracteres.`,
    invalid: (fieldLabel) => `${fieldLabel} inválido.`,
    mustBeBoolean: (fieldLabel) => `${fieldLabel} deve ser verdadeiro ou falso.`,
    invalidEmail: "E-mail inválido.",
    passwordTooShort: (minLength) => `A senha precisa ter pelo menos ${minLength} caracteres.`,
    passwordTooLong: "A senha pode ter no máximo 128 caracteres.",
    passwordNeedsLettersAndNumbers: "A senha precisa ter letras e números.",
    avatarType: "A foto precisa ser uma imagem JPEG, PNG ou WebP.",
    avatarTooBig: "A foto é grande demais. Escolha outra imagem.",
    acceptTerms: "Para criar a conta, aceite o Termo de Uso.",
    codeRequired: "Informe o código de 6 dígitos.",
    fieldNotEditable: (field) => `Campo não pode ser alterado: ${field}.`,
    eventsRequired: "Envie {events: [...]}.",
    notificationIds: "Envie ids ou all: true.",
    rankingMetric: "Critério de ranking inválido. Use activities, xp ou streak.",
    chatHistory: "Histórico inválido.",
  }),

  /** Respostas de sucesso (campo "message"). */
  success: Object.freeze({
    accountCreated: "Conta criada.",
    welcomeBack: "Bem-vindo de volta!",
    profileUpdated: "Perfil atualizado.",
    accountDeleted: "Conta excluída.",
    resetCodeSent: "Se o e-mail tiver conta, enviamos um código de 6 dígitos.",
    passwordChanged: "Senha alterada.",
    activityStarted: "Atividade iniciada.",
    activityFinished: "Atividade concluída.",
  }),

  /** Assistente: respostas montadas com o dicionário quando a IA está desligada, falhou ou demorou. */
  assistant: Object.freeze({
    noSignFound: "Não encontrei esse sinal no dicionário ainda. Tente procurar por outra palavra na aba Dicionário.",
    signsFound: (words) => `Encontrei no dicionário: ${words}. Toque em um sinal abaixo para ver o avatar fazendo o gesto.`,
  }),
});
