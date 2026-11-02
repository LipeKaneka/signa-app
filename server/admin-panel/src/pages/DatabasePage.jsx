import { api, downloadExport } from "../api.js";
import { Notice, confirmAction, useAction } from "../components/ui.jsx";

/** Banco de dados: exportar o conteúdo (cópia de segurança) e criar o conteúdo padrão que faltar. */
export function DatabasePage() {
  const exporting = useAction();
  const seeding = useAction();

  const runSeed = () => {
    if (!confirmAction("Criar o conteúdo padrão que estiver faltando? Nada que já existe é alterado.")) return;
    seeding.run(async () => {
      const { summary } = await api("/database/seed", { method: "POST" });
      return summary;
    }, "Seed concluído. Itens que já existiam não foram alterados.");
  };

  return (
    <section>
      <h1>Banco de dados</h1>
      <div className="card">
        <h2>Exportar conteúdo</h2>
        <p className="muted">Baixa um arquivo JSON com sinais, módulos, atividades (com gabarito), conquistas, eventos, níveis e
          configurações. Não inclui usuários, senhas nem contas do painel.</p>
        <button className="button" disabled={exporting.busy} onClick={() => exporting.run(downloadExport, "Arquivo baixado.")}>Baixar JSON</button>
        <Notice message={exporting.message} />
      </div>
      <div className="card">
        <h2>Conteúdo padrão (seed)</h2>
        <p className="muted">Recria o que faltar do conteúdo inicial (sinais, trilha, conquistas, níveis). Útil se algo foi excluído por engano.</p>
        <button className="button button--ghost" disabled={seeding.busy} onClick={runSeed}>Rodar seed</button>
        <Notice message={seeding.message} />
      </div>
      <div className="card">
        <h2>Cópia completa do banco</h2>
        <p className="muted">Backup e restauração completos (com usuários) não ficam no painel por segurança: são feitos no servidor
          com as ferramentas do MongoDB (ver docs/PAINEL-ADMIN.md).</p>
      </div>
    </section>
  );
}
