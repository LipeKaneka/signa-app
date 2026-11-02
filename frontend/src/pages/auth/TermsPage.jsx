import { useNavigate } from "react-router-dom";
import "./auth.css";

/** Versão do texto: muda quando o termo mudar (o servidor guarda quando a pessoa aceitou). */
export const TERMS_VERSION = "2026-10-28";

const SECTIONS = [
  {
    title: "Aceitação dos Termos",
    items: [
      "Ao acessar e utilizar este aplicativo de aprendizado de Língua Brasileira de Sinais (LIBRAS), o usuário concorda com os presentes Termos de Uso. Caso não concorde com alguma das condições estabelecidas, deverá interromper o uso do aplicativo.",
    ],
  },
  {
    title: "Objetivo do Aplicativo",
    items: [
      "O aplicativo tem como objetivo promover o aprendizado de LIBRAS de forma acessível, interativa e gamificada, utilizando atividades, desafios, exercícios, níveis, pontuações e conquistas para incentivar o desenvolvimento das habilidades de comunicação em língua de sinais.",
      "O conteúdo disponibilizado possui finalidade educacional e busca contribuir para a inclusão e a aproximação entre pessoas surdas e ouvintes. Ele não substitui cursos presenciais nem o contato com a comunidade surda.",
    ],
  },
  {
    title: "Cadastro e Conta do Usuário",
    items: [
      "Para utilizar determinadas funcionalidades, poderá ser necessário criar uma conta e fornecer informações pessoais. O usuário compromete-se a fornecer informações verdadeiras e a manter seus dados atualizados.",
      "O usuário é responsável por manter a segurança da sua senha e por todas as atividades realizadas em sua conta. Em caso de uso indevido, a conta poderá ser bloqueada.",
    ],
  },
  {
    title: "Dados Pessoais e Privacidade",
    items: [
      "Guardamos apenas o necessário para o aplicativo funcionar: nome, e-mail, cidade (opcional), progresso, pontuação e conquistas. A senha é guardada de forma protegida (embaralhada por um algoritmo próprio para senhas) e nunca em texto puro.",
      "O nome e a pontuação aparecem no ranking para os outros usuários. O usuário pode excluir a conta e os seus dados a qualquer momento nas Configurações, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).",
    ],
  },
  {
    title: "Uso da Câmera",
    items: [
      "O reconhecimento de sinais pela câmera é feito no próprio aparelho. As imagens não são gravadas nem enviadas para os nossos servidores; apenas os pontos das mãos são usados durante a prática.",
      "Os sinais ensinados pelo usuário ficam salvos somente no aparelho dele.",
    ],
  },
  {
    title: "Assistente com Inteligência Artificial",
    items: [
      "As perguntas feitas ao assistente são enviadas a um serviço de inteligência artificial para gerar a resposta. Não envie dados pessoais ou sensíveis pelo assistente. As respostas podem conter erros e devem ser conferidas no dicionário.",
    ],
  },
  {
    title: "Conduta do Usuário",
    items: [
      "É proibido usar nomes ofensivos, tentar burlar o sistema de pontos, acessar contas de outras pessoas ou prejudicar o funcionamento do aplicativo.",
    ],
  },
  {
    title: "Conteúdo e Propriedade",
    items: [
      "Os textos, ilustrações e atividades pertencem aos seus autores. As animações em Libras são exibidas pelo VLibras, do Governo Federal. É proibido copiar ou redistribuir o conteúdo sem autorização.",
    ],
  },
  {
    title: "Alterações nos Termos",
    items: [
      "Estes termos podem ser atualizados. Quando houver mudança importante, o usuário será avisado no aplicativo.",
    ],
  },
];

/** Ícone do protótipo: duas folhas sobrepostas. */
function DocumentsIcon() {
  return (
    <svg width="76" height="80" viewBox="0 0 76 80" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" aria-hidden="true">
      <path d="M26 6 H50 L68 24 V60 A6 6 0 0 1 62 66 H26 A6 6 0 0 1 20 60 V12 A6 6 0 0 1 26 6 Z" />
      <path d="M50 6 V24 H68" />
      <path d="M20 22 H14 A6 6 0 0 0 8 28 V68 A6 6 0 0 0 14 74 H48 A6 6 0 0 0 54 68 V66" />
    </svg>
  );
}

/**
 * Termo de Uso (protótipo "termos de autorização alta"): texto rolável e "Voltar".
 * @param {{onBack: () => void}} props
 * Usado por: RegisterPage (por cima do formulário, sem perder o que foi digitado) e TermsPage.
 */
export function TermsScreen({ onBack }) {
  return (
    <main className="terms-screen">
      <DocumentsIcon />
      <h1 className="terms-screen__title">Termo de Uso</h1>
      <div className="terms-screen__text" tabIndex={0} aria-label="Texto do Termo de Uso">
        <ol>
          {SECTIONS.map((section) => (
            <li key={section.title}>
              {section.title}
              <ul>
                {section.items.map((item) => <li key={item.slice(0, 30)}>{item}</li>)}
              </ul>
            </li>
          ))}
        </ol>
        <p className="terms-screen__version">Versão de {TERMS_VERSION.split("-").reverse().join("/")}.</p>
      </div>
      <button type="button" className="button-primary terms-screen__back" onClick={onBack}>Voltar</button>
    </main>
  );
}

/** Rota /termos (aberta pelas Configurações ou direto pelo link). */
export function TermsPage() {
  const navigate = useNavigate();
  return <TermsScreen onBack={() => navigate(-1)} />;
}
