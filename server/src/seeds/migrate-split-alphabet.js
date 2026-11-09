import { ModuleModel } from "../models/model-module.js";
import { ActivityModel } from "../models/model-activity.js";
import { AttemptModel } from "../models/model-attempt.js";
import { UserModel } from "../models/model-user.js";

const MODULE_SLUG = "alfabetizacao";
const ORIGINAL_QUESTIONS = 27;
/** A parte 1 fica com A a M (13 letras); a parte 2, com N a Z e Ç (14). */
const PART_ONE_QUESTIONS = 13;
export const ALPHABET_PART_ONE = {
  title: "Alfabeto: parte 1",
  description: "As letras de A a M no alfabeto manual. Soletrar serve para nomes e palavras sem sinal",
};
export const ALPHABET_PART_TWO = {
  title: "Alfabeto: parte 2",
  description: "As letras de N a Z e o Ç no alfabeto manual",
};

/**
 * Divide em duas a atividade "Alfabeto" de um banco que já tinha a versão única (27 perguntas), mantendo o progresso:
 * quem já concluiu a atividade ganha as duas partes com a mesma nota, para o módulo seguinte não voltar a travar.
 * Pode rodar várias vezes e ser retomada se parar no meio: a parte 1 só é reduzida no último passo, e sem atividade
 * de 27 perguntas não faz nada. O seed só cria o que falta, então sem isto o banco ficaria com a atividade antiga.
 * @returns {Promise<boolean>} true se dividiu agora.
 * Usado por: seedContent (`npm run seed` e o botão de seed do painel), antes de criar as atividades.
 */
export async function splitAlphabetActivity() {
  const module = await ModuleModel.findOne({ slug: MODULE_SLUG }).lean();
  if (!module) return false;
  const original = await ActivityModel.findOne({ module: module._id, order: 1 }).lean();
  if (original?.questions.length !== ORIGINAL_QUESTIONS) return false;

  let partTwo = await ActivityModel.findOne({ module: module._id, title: ALPHABET_PART_TWO.title });
  if (!partTwo) {
    // Abre o lugar 2 (da maior ordem para a menor, por causa do índice único). Se parou aqui antes, o lugar já está livre.
    if (await ActivityModel.exists({ module: module._id, order: 2 })) {
      const following = await ActivityModel.find({ module: module._id, order: { $gte: 2 } }).sort({ order: -1 }).select("order").lean();
      for (const activity of following) await ActivityModel.updateOne({ _id: activity._id }, { $set: { order: activity.order + 1 } });
    }
    partTwo = await ActivityModel.create({
      module: module._id,
      order: 2,
      ...ALPHABET_PART_TWO,
      active: original.active,
      questionsPerAttempt: null,
      questions: original.questions.slice(PART_ONE_QUESTIONS).map((question, index) => ({ ...question, key: `q${index + 1}` })),
    });
  }

  const finishers = await UserModel.find({ "completedActivities.activity": original._id }).select("completedActivities").lean();
  const credited = finishers.filter((user) => !user.completedActivities.some((entry) => String(entry.activity) === String(partTwo._id)));
  if (credited.length > 0) {
    await UserModel.bulkWrite(credited.map((user) => {
      const { bestScore, completedAt } = user.completedActivities.find((entry) => String(entry.activity) === String(original._id));
      return {
        updateOne: {
          filter: { _id: user._id, "completedActivities.activity": { $ne: partTwo._id } },
          update: { $push: { completedActivities: { activity: partTwo._id, bestScore, completedAt } }, $inc: { completedActivitiesCount: 1 } },
        },
      };
    }));
  }

  // Tentativa em andamento pode ter perguntas que saíram da parte 1.
  await AttemptModel.updateMany({ activity: original._id, status: "in_progress" }, { $set: { status: "expired" } });
  await ActivityModel.updateOne(
    { _id: original._id },
    { $set: { ...ALPHABET_PART_ONE, questions: original.questions.slice(0, PART_ONE_QUESTIONS) } },
  );
  return true;
}
