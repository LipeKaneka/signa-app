/**
 * Textos de erro, de "carregando" e de tela vazia do app, num lugar só. Para mudar um texto, mude só aqui.
 * - Erros de regra (atividade bloqueada, senha errada...) vêm prontos do backend/servidor:
 *   veja backend/src/config/messages.js e server/src/config/messages.js.
 * - A abertura que aparece no F5 ANTES do JavaScript carregar fica em frontend/index.html (HTML puro, não lê este
 *   arquivo): se mudar app.opening aqui, mude lá também.
 * - Textos editáveis pelo painel (frases de acerto/erro) ficam em AppConfigContext (FALLBACK_SETTINGS).
 */
export const MESSAGES = Object.freeze({
  /** Falhas de rede e respostas sem texto do servidor (api/http-client.js). */
  network: Object.freeze({
    offline: "Sem conexão com o servidor. Verifique sua internet.",
    timeout: "O servidor demorou demais para responder. Tente de novo.",
    generic: "Algo deu errado. Tente novamente.",
    streamUnavailable: "Fluxo indisponível.",
  }),

  /** Abertura do app (SplashScreen). */
  app: Object.freeze({
    opening: "Carregando…",
    connectingSlow: "Conectando ao servidor… na primeira vez do dia isso pode levar até 1 minuto.",
    offline: "Sem conexão com o servidor agora. Confira a internet e tente de novo.",
    unsupportedVersion: "Esta versão do Signa não é mais suportada. Baixe a nova para continuar estudando.",
  }),

  /** Pop-ups (avisos, manutenção, atualizações). Os textos principais vêm do painel; estes são os de apoio. */
  popups: Object.freeze({
    // Reservas do pop-up de atualização, se o servidor ainda não mandar os textos (o painel edita os de verdade).
    updateTitle: "Atualização",
    updateMessage: "A versão {versao} do Signa chegou. Você tem a {atual}.",
    updateNotesTitle: "Novidades",
    updateButton: "Atualizar agora",
    updateLater: "Depois",
    announcementButton: "Entendi",
    maintenanceStaff: "Sou da equipe: entrar",
    maintenanceWebClosed: "Pode fechar esta aba. Avisamos quando o app voltar.",
    updateHint: "O arquivo é baixado pelo navegador. Abra-o para instalar: se o Android pedir, permita instalar apps desta fonte. Seu progresso continua salvo na sua conta.",
  }),

  /** "Carregando…" das telas. */
  loading: Object.freeze({
    generic: "Carregando…",
    trail: "Carregando a trilha…",
    module: "Carregando o módulo…",
    activity: "Preparando a atividade…",
    achievements: "Carregando as conquistas…",
    notifications: "Carregando notificações…",
    camera: "Abrindo a câmera…",
  }),

  /** Telas sem conteúdo ainda. */
  empty: Object.freeze({
    achievements: "Nenhuma conquista ainda. Conclua atividades na trilha para ganhar a primeira!",
    notifications: "Nenhuma notificação ainda. Conquistas, eventos e avisos aparecem aqui.",
    dictionarySearch: "Nenhum sinal encontrado.",
    signAvatar: "Ainda não temos o avatar deste sinal.",
    banReason: "Não informado.",
  }),

  /** Câmera e tradutor (useHandCamera, capas da câmera, pergunta "Faça o sinal"). */
  camera: Object.freeze({
    permissionDenied: "Permita o acesso à câmera nas configurações do aparelho.",
    inUse: "A câmera está sendo usada por outro programa ou aba. Feche-o e tente de novo.",
    notFound: "Nenhuma câmera foi encontrada.",
    unavailable: "Não foi possível abrir a câmera agora. Tente de novo em instantes.",
    unsupportedBrowser: "Este navegador não dá acesso à câmera (abra por https ou localhost).",
    opening: "Abrindo a câmera…",
    preparingHands: "Preparando o reconhecimento das mãos…",
    preparing: "Preparando a câmera…",
    failedTitle: "A câmera não abriu",
    questionWithoutCamera: "Sem câmera, esta pergunta pode ser pulada sem perder ponto.",
    wordModelUnavailable: "indisponível no momento",
  }),

  /** Avatar do VLibras. */
  signAvatar: Object.freeze({
    preparing: "Preparando o sinal…",
    slowFirstTime: "Na primeira vez pode levar até um minuto.",
    unavailable: "Não foi possível mostrar o sinal agora.",
    skipped: "Você seguiu sem o avatar.",
  }),

  /** Entrada, cadastro e recuperação de senha (avisos antes de enviar ao servidor). */
  auth: Object.freeze({
    invalidEmail: "E-mail inválido.",
    nameRequired: "Informe seu nome.",
    acceptTerms: "Para criar a conta, aceite o Termo de Uso.",
    passwordTooShort: (minLength) => `A senha precisa ter pelo menos ${minLength} caracteres.`,
    passwordNeedsLettersAndNumbers: "A senha precisa ter letras e números.",
    passwordsDiffer: "As senhas não são iguais.",
    codeIncomplete: "Digite os 6 números do código.",
    codeResent: "Enviamos um novo código.",
    googleUnavailable: "Entrar com o Google ainda não está disponível. Use e-mail e senha.",
    googleFailed: "Não foi possível entrar com o Google. Tente de novo.",
    googleNoToken: "Sem token do Google.",
  }),

  /** Foto de perfil (utils/avatar-image.js). */
  profilePhoto: Object.freeze({
    notAnImage: "Escolha um arquivo de imagem.",
    cannotOpen: "Não foi possível abrir essa imagem. Tente outra.",
    tooBig: "A foto ficou grande demais. Tente outra imagem.",
  }),
});
