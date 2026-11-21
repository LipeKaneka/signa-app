/**
 * TODAS as mensagens de erro e de aviso que o servidor devolve (ao backend, que repassa ao app, e ao painel).
 * Para mudar um texto, mude só aqui: o código usa estas chaves (ex.: MESSAGES.attempt.expired).
 * Mensagens com partes variáveis são funções (ex.: MESSAGES.validation.tooLong("o apelido", 60)).
 * Organizadas por assunto: geral, conta, recuperação de senha, validação, trilha/atividades, ranking, dicionário,
 * notificações, ações do app e painel administrativo.
 */
export const MESSAGES = Object.freeze({
  /** Respostas genéricas (rota inexistente, erro interno, JSON quebrado...). */
  general: Object.freeze({
    routeNotFound: "Rota não encontrada.",
    internalError: "Erro interno. Tente novamente mais tarde.",
    invalidJson: "JSON inválido.",
    invalidId: "Identificador inválido.",
    invalidData: "Dados inválidos.",
    loginRequired: "Faça login para continuar.",
    forbidden: "Você não tem permissão para isso.",
    notFound: "Não encontrado.",
    invalidServiceKey: "Chave de serviço inválida.",
  }),

  /** Conta do app: cadastro, login, sessão, banimento, Google. */
  account: Object.freeze({
    wrongCredentials: "E-mail ou senha incorretos.",
    emailTaken: "Este e-mail já está cadastrado.",
    acceptTerms: "Para criar a conta, aceite o Termo de Uso.",
    sessionInvalid: "Sessão inválida. Entre novamente.",
    banned: "Conta banida.",
    currentPasswordRequired: "Informe a senha atual para trocar e-mail ou senha.",
    currentPasswordWrong: "Senha atual incorreta.",
    fieldNotEditable: (field) => `Campo não pode ser alterado: ${field}.`,
    googleUnavailable: "Entrar com o Google ainda não está disponível. Use e-mail e senha.",
    googleNotConfirmed: "Não foi possível confirmar sua conta Google. Tente de novo.",
    googleEmailNotVerified: "O e-mail desta conta Google não está confirmado.",
  }),

  /** Recuperação de senha por código no e-mail. */
  passwordReset: Object.freeze({
    codeRequired: "Informe o código de 6 dígitos.",
    invalidCode: "Código inválido ou vencido. Peça um novo código.",
    wrongCode: "Código incorreto. Confira o e-mail e tente de novo.",
    waitToResend: "Espere um minuto para pedir outro código.",
    mailFailed: "Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.",
  }),

  /** Validação de campos (usadas por util-validators e pelas telas do painel). fieldLabel = "o apelido", "Cidade"... */
  validation: Object.freeze({
    required: (fieldLabel) => `Informe ${fieldLabel}.`,
    tooLong: (fieldLabel, maxLength) => `${fieldLabel} pode ter no máximo ${maxLength} caracteres.`,
    invalid: (fieldLabel) => `${fieldLabel} inválido.`,
    mustBeBoolean: (fieldLabel) => `${fieldLabel} deve ser verdadeiro ou falso.`,
    integerRange: (fieldLabel, min, max) => `${fieldLabel}: use um número inteiro entre ${min} e ${max}.`,
    invalidDate: (fieldLabel) => `${fieldLabel}: data inválida.`,
    invalidEmail: "E-mail inválido.",
    passwordTooShort: (minLength) => `A senha precisa ter pelo menos ${minLength} caracteres.`,
    passwordTooLong: "A senha pode ter no máximo 128 caracteres.",
    passwordNeedsLettersAndNumbers: "A senha precisa ter letras e números.",
    adminPasswordTooShort: (minLength) => `A senha do painel precisa ter pelo menos ${minLength} caracteres.`,
    avatarType: "A foto precisa ser uma imagem JPEG, PNG ou WebP.",
    avatarTooBig: "A foto é grande demais. Escolha outra imagem.",
  }),

  /** Trilha, tentativas e respostas. */
  attempt: Object.freeze({
    activityNotFound: "Atividade não encontrada.",
    activityLocked: "Conclua as atividades anteriores para liberar esta.",
    notFound: "Tentativa não encontrada.",
    alreadyFinished: "Esta tentativa já foi encerrada.",
    expired: "Esta tentativa expirou. Comece de novo.",
    questionNotFound: "Pergunta não encontrada nesta atividade.",
    questionNotInAttempt: "Esta pergunta não faz parte desta tentativa.",
    invalidOption: "Alternativa inválida.",
    alreadyAnswered: "Esta pergunta já foi respondida.",
  }),

  ranking: Object.freeze({
    invalidMetric: "Critério de ranking inválido. Use activities, xp ou streak.",
  }),

  dictionary: Object.freeze({
    signNotFound: "Sinal não encontrado no dicionário.",
  }),

  /** Notificações do app e avisos do painel. */
  notifications: Object.freeze({
    invalidIds: "Envie ids (lista de até 100) ou all: true.",
    invalidToken: (label) => `${label} inválido.`,
    typeNotFound: "Tipo de notificação não encontrado.",
    userNotFound: "Usuário não encontrado.",
    manualHasNoTemplate: "O aviso do painel é escrito na hora do envio: não tem texto padrão.",
    manualTypeDisabled: "O tipo \"Aviso do painel\" está desligado. Ligue-o para enviar.",
    titleRequired: "Escreva o título do aviso.",
    nothingToChange: "Nada para mudar.",
    mustBeText: (label) => `${label} deve ser texto.`,
    textTooLong: (label, max) => `${label}: no máximo ${max} caracteres.`,
    mustBeTrueOrFalse: (label) => `${label} deve ser true ou false.`,
  }),

  /**
   * Pop-ups do app (Avisos, Manutenção, Atualizações). Os textos "padrão" valem quando o campo do painel fica vazio.
   * Nos e-mails, {nome} vira o apelido da pessoa e {previsao} a data/hora prevista para terminar.
   */
  popups: Object.freeze({
    defaults: Object.freeze({
      announcementButton: "Entendi",
      maintenanceTitle: "Manutenção",
      maintenanceMessage: "O Signa Ludus está em manutenção para ficar ainda melhor. Volte daqui a pouco!",
      maintenanceButton: "Fechar o app",
      maintenanceNotesTitle: "Previsão",
      startEmailSubject: "O Signa Ludus está em manutenção",
      startEmailBody: "Olá, {nome}!\n\nO Signa Ludus entrou em manutenção e fica fora do ar por um tempo. Previsão de volta: {previsao}.\n\nAvisamos por aqui quando terminar.",
      endEmailSubject: "O Signa Ludus voltou!",
      endEmailBody: "Olá, {nome}!\n\nA manutenção terminou e o app já está liberado. Bons estudos!",
      noForecast: "assim que possível",
    }),
    announcementNotFound: "Aviso não encontrado.",
    titleRequired: "Escreva o título.",
    linkMustBeHttps: "O link precisa começar com https://",
    endBeforeStart: "O fim precisa ser depois do início.",
    invalidAllowedEmail: (email) => `E-mail inválido na lista de liberados: ${email}.`,
    tooManyAllowedEmails: (max) => `A lista de liberados aceita até ${max} e-mails.`,
    invalidAudience: "Destinatários do e-mail de fim: use blocked ou all.",
  }),

  /** Ações do app que valem conquista (toques, sinais vistos...). */
  appEvents: Object.freeze({
    eventCount: (max) => `Envie de 1 a ${max} eventos.`,
    invalidEvent: "Evento inválido.",
    invalidSign: "Sinal inválido.",
    invalidCount: (max) => `Quantidade inválida (1 a ${max}).`,
  }),

  /** Painel administrativo. */
  admin: Object.freeze({
    sessionExpired: "Sessão do painel expirada. Entre novamente.",
    originNotAllowed: "Origem não permitida.",
    requestRefused: "Requisição recusada.",
    roleNotAllowed: "Seu papel no painel não permite esta ação.",
    accountDisabled: "Conta do painel desativada.",
    tooManyLoginAttempts: "Muitas tentativas de login. Espere 15 minutos e tente de novo.",
    accountNotFound: "Conta do painel não encontrada.",
    accountEmailTaken: "Já existe uma conta do painel com este e-mail.",
    invalidRole: (roles) => `Papel inválido. Use: ${roles.join(", ")}.`,
    invalidStatus: "Status inválido.",
    cannotChangeOwnAccount: "Você não pode mudar o seu próprio papel ou status.",
    needsOneOwner: "O painel precisa de pelo menos um owner ativo.",
    confirmDeletion: "Para excluir, confirme digitando EXCLUIR.",
    invalidObjectId: (fieldLabel) => `${fieldLabel} inválido.`,
    sendIdsInOrder: "Envie a lista de ids na ordem nova.",

    // Usuários do app
    userNotFound: "Usuário não encontrado.",
    userEmailTaken: "Este e-mail já é de outra conta.",
    nothingChanged: "Nada mudou.",
    banDays: (maxDays) => `Prazo do banimento: de 1 a ${maxDays} dias (ou sem prazo).`,
    xpAdjustment: "Ajuste de XP: use um número diferente de 0.",
    completedFlag: "Informe completed: true ou false.",
    activityNotCompleted: "Esta atividade já não está concluída.",
    actionsMustBeObject: "actions deve ser um objeto.",
    unknownCounter: (type) => `Contador desconhecido: ${type}.`,
    achievementOverride: "Use granted, revoked ou auto.",
    achievementNotFoundOrInactive: "Conquista não encontrada (ou desativada).",

    // Trilha (módulos, atividades e perguntas)
    moduleNotFound: "Módulo não encontrado.",
    prerequisiteNotFound: "Módulo de pré-requisito não encontrado.",
    prerequisiteCycle: "Esse pré-requisito criaria um ciclo entre módulos.",
    deactivateModuleFirst: "Desative o módulo antes de excluir.",
    deleteModuleActivitiesFirst: "Exclua as atividades deste módulo antes.",
    sendAllModules: "Envie todos os módulos, cada um uma vez.",
    activityNotFound: "Atividade não encontrada.",
    deactivateActivityFirst: "Desative a atividade antes de excluir.",
    sendAllActivities: "Envie todas as atividades do módulo, cada uma uma vez.",
    slugFailed: "Não foi possível gerar um identificador para este título.",
    questionCount: (max) => `A atividade precisa ter de 1 a ${max} perguntas.`,
    question: Object.freeze({
      invalidFormat: (label) => `${label}: formato inválido.`,
      duplicateKey: (label, key) => `${label}: identificador "${key}" repetido.`,
      invalidType: (label) => `${label}: tipo inválido.`,
      promptLength: (label) => `${label}: enunciado de 1 a 500 caracteres.`,
      explanationLength: (label) => `${label}: explicação de até 1000 caracteres.`,
      cameraTarget: (label) => `${label}: escolha um sinal que a câmera reconhece.`,
      dictionarySign: (label) => `${label}: escolha um sinal do dicionário.`,
      optionCount: (label, min, max) => `${label}: de ${min} a ${max} alternativas.`,
      optionLength: (label, optionNumber) => `${label}: alternativa ${optionNumber} precisa de 1 a 200 caracteres.`,
      duplicateOption: (label) => `${label}: alternativas com o mesmo identificador.`,
      correctOption: (label) => `${label}: marque a alternativa correta.`,
    }),

    // Dicionário
    signNotFound: "Verbete não encontrado.",
    signExists: (slug) => `Já existe o verbete "${slug}".`,
    invalidWord: "Palavra inválida.",
    deactivateSignFirst: "Desative o verbete antes de excluir.",
    signInUse: "Este sinal é usado em perguntas de atividades. Troque as perguntas antes de excluir.",

    // Conquistas, raridades, eventos, níveis e configurações
    achievementNotFound: "Conquista não encontrada.",
    achievementExists: (key) => `Já existe a conquista "${key}".`,
    deactivateAchievementFirst: "Desative a conquista antes de excluir.",
    invalidKey: "Chave: use só letras minúsculas, números e _.",
    tierNotFound: "Raridade não encontrada.",
    tierExists: (key) => `Já existe a raridade "${key}".`,
    tierMissing: (key) => `A raridade "${key}" não existe.`,
    keepOneTier: "Deixe pelo menos uma raridade.",
    sendAllTiers: "Envie todas as raridades, cada uma uma vez, na nova ordem.",
    eventNotFound: "Evento não encontrado.",
    eventDatesRequired: "Evento de uma vez: informe o início e o fim.",
    eventFieldRequired: (label) => `${label}: obrigatório em evento de uma vez.`,
    eventEndBeforeStart: "O fim do evento precisa ser depois do início.",
    eventNotRunning: "Só dá para encerrar um evento em andamento.",
    recurringEventUseDeactivate: "Evento que se repete: use Desativar para parar.",
    deactivateEventFirst: "Desative ou encerre o evento antes de excluir.",
    invalidMultiplier: "Multiplicador: um número a partir de 1 (ex.: 2, 1.5 ou 50).",
    levelCount: "Envie de 1 a 100 níveis.",
    levelStartsAtZero: "Um dos níveis precisa começar em 0 XP (é o nível 1).",
    levelName: (line) => `Linha ${line}: nome de 1 a 60 caracteres.`,
    levelMinXp: (line, title) => `Linha ${line} ("${title}"): XP mínimo precisa ser um inteiro de 0 a 10.000.000.`,
    levelSameXp: (previousTitle, title, minXp) => `"${previousTitle}" e "${title}" têm o mesmo XP mínimo (${minXp}).`,
    unknownSetting: (key) => `Configuração desconhecida: ${key}.`,
    setting: Object.freeze({
      phraseCount: (label, maxItems) => `${label}: envie de 1 a ${maxItems} frases.`,
      phraseLength: (number, titleMax, textMax) => `Frase ${number}: título de 1 a ${titleMax} caracteres e texto de até ${textMax}.`,
      integerRange: (label, min, max) => `${label}: use um número inteiro entre ${min} e ${max}.`,
      textLength: (label, minLength, maxLength) => `${label}: texto de ${minLength} a ${maxLength} caracteres.`,
      httpsLink: (label) => `${label}: use um link começando com https://`,
    }),

    // Banco de dados (explorador do painel)
    collectionNotFound: "Coleção não encontrada.",
    documentNotFound: "Documento não encontrado.",
    sendFields: "Envie os campos a alterar.",
    noFieldChanged: "Nenhum campo alterado.",
    invalidField: (field) => `Campo inválido: ${field}.`,
    fieldNotEditableHere: (field) => `O campo "${field}" não pode ser alterado aqui.`,
    invalidValue: (path) => `Valor inválido em "${path}".`,
    duplicateValue: (fields) => `Já existe um documento com esse valor (${fields || "campo único"}).`,

    // Atualização do app (GitHub)
    invalidRepository: "Repositório inválido. Use o formato dono/nome (ex.: LipeKaneka/signa-app).",
    noRelease: (name) => `Nenhuma release publicada em ${name} (ou o repositório é privado).`,
    githubUnavailable: "Não foi possível falar com o GitHub agora. Tente de novo.",
  }),
});
