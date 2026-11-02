/**
 * Frases padrão da folha que sobe depois de cada resposta. O app sorteia uma a cada pergunta (sem repetir a anterior).
 * Editáveis no painel (Configurações → Textos do app); estas valem enquanto o banco não tiver outra lista.
 * Formato: {title, text}. Título até 40 caracteres, texto até 90.
 * Usado por: setting-definitions.js (padrão de app.feedback.correctPhrases / wrongPhrases).
 */
export const CORRECT_PHRASES = Object.freeze([
  { title: "Boa Baby !!", text: "você conseguiu acertar de primeira" },
  { title: "Mandou bem!", text: "suas mãos estão ficando fluentes" },
  { title: "Isso aí!", text: "mais um sinal para a sua coleção" },
  { title: "Arrasou!", text: "parece que você nasceu sinalizando" },
  { title: "Na mosca!", text: "você leu o sinal direitinho" },
  { title: "Que olho bom!", text: "nenhum detalhe passou despercebido" },
  { title: "É isso!", text: "continue assim que a fluência vem" },
  { title: "Show de bola!", text: "acertou com estilo" },
  { title: "Perfeito!", text: "o avatar ficou orgulhoso de você" },
  { title: "Uau!", text: "você está pegando o jeito rapidinho" },
  { title: "Certíssimo!", text: "sua Libras está evoluindo" },
  { title: "Brilhou!", text: "mais um passo na trilha" },
]);

export const WRONG_PHRASES = Object.freeze([
  { title: "Talvez na próxima", text: "revise mais os conceitos e refaça, melhore" },
  { title: "Quase lá!", text: "olhe de novo o formato da mão" },
  { title: "Não foi dessa vez", text: "errar faz parte de aprender" },
  { title: "Respira e tenta de novo", text: "toque em ↻ para rever o sinal quantas vezes quiser" },
  { title: "Opa!", text: "esse era parecido, mas não era ele" },
  { title: "Calma, você consegue", text: "cada erro ensina um detalhe novo" },
  { title: "Faltou pouco!", text: "preste atenção no movimento das mãos" },
  { title: "Ainda não", text: "repare na posição da mão e na expressão do rosto" },
  { title: "Tropeçou, levanta!", text: "na revisão você pega esse" },
  { title: "Hmm, não era esse", text: "compare com a resposta certa" },
  { title: "Bora de novo!", text: "ninguém aprende Libras num dia só" },
  { title: "Errou, mas valeu!", text: "agora você já sabe qual é" },
]);
