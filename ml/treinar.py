"""Treina a LSTM de sinais dinâmicos, avalia por pessoa e só exporta para o app se aprovada.

Protocolo (nenhuma pessoa aparece em mais de um conjunto):
  1. TESTE: 2 pessoas separadas no início e usadas uma única vez, no fim.
  2. VALIDAÇÃO: validação cruzada agrupada por pessoa (5 dobras) nas demais, para escolher
     o número de épocas e calibrar o limiar de confiança ("não reconhecido").
  3. Modelo final treinado em todas as pessoas que não são de teste e avaliado no TESTE.
  4. Exporta para frontend/public/modelos/ somente se o teste passar nos critérios de APROVACAO.

Sinais experimentais (--experimentais): palavras do dicionário do app que só o INES tem (uma pessoa).
Entram sempre no treino e nunca na validação/teste (não há pessoas nunca vistas para eles); a avaliação e a
aprovação continuam valendo só para os sinais com várias pessoas. No app, exigem confiança alta.

Uso:  python treinar.py [--sem-proprias] [--sem-ines] [--experimentais] [--teste minds-02 minds-11]
"""
import argparse
import base64
import json
import os
import time
from collections import Counter, defaultdict

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')
import numpy as np
from sklearn.metrics import confusion_matrix, f1_score, precision_recall_fscore_support
from sklearn.model_selection import GroupKFold

import caracteristicas as C
import config
import dados

SEMENTE = 42
AUMENTOS_POR_AMOSTRA = 6
# Sinal experimental (1 a 3 vídeos do INES): mais variações por vídeo, para não sumir perto dos sinais da MINDS.
SEQUENCIAS_POR_SINAL_EXPERIMENTAL = 60
# Critérios mínimos no conjunto de TESTE (pessoas nunca vistas) para liberar o uso no app.
APROVACAO = dict(acuracia=0.80, f1_macro=0.75, recall_min_por_sinal=0.40)
PRECISAO_ALVO_LIMIAR = 0.95   # acima do limiar, ao menos 95% de acerto na validação cruzada

APP = config.RAIZ.parent / 'frontend' / 'public' / 'modelos' / 'sinais-dinamicos.json'
RELATORIOS = config.RAIZ / 'relatorios'


def montar(n_classes):
    import tensorflow as tf
    tf.keras.utils.set_random_seed(SEMENTE)
    L = tf.keras.layers
    unidades = 64 if n_classes <= 40 else 128  # vocabulário grande precisa de mais memória na LSTM
    m = tf.keras.Sequential([
        L.Input((C.T_PASSOS, C.N_CARAC)),
        L.Dense(unidades, activation='relu', name='entrada'),   # aplicada a cada quadro
        L.Dropout(0.3),
        L.LSTM(unidades, name='lstm'),
        L.Dropout(0.4),
        L.Dense(n_classes, activation='softmax', name='saida'),
    ])
    m.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss='sparse_categorical_crossentropy', metrics=['accuracy'])
    return m


def conjunto(itens, rng, aumentar):
    X, y = [], []
    for it, cls in itens:
        X.append(dados.sequencia_de(it, esp=False))
        y.append(cls)
        if aumentar:
            for _ in range(it.get('aumentos', AUMENTOS_POR_AMOSTRA)):
                X.append(dados.sequencia_de(it, esp=bool(rng.random() < 0.5), rng=rng))
                y.append(cls)
    return np.stack(X), np.array(y)


def treinar_modelo(tr, va, n_classes, rng, epocas=None):
    import tensorflow as tf
    Xtr, ytr = conjunto(tr, rng, aumentar=True)
    media, desvio = Xtr.reshape(-1, C.N_CARAC).mean(0), Xtr.reshape(-1, C.N_CARAC).std(0) + 1e-6
    norm = lambda X: (X - media) / desvio
    m = montar(n_classes)
    cbs, val = [], None
    if va is not None:
        Xva, yva = conjunto(va, rng, aumentar=False)
        val = (norm(Xva), yva)
        cbs.append(tf.keras.callbacks.EarlyStopping(monitor='val_loss', patience=25, restore_best_weights=True))
    h = m.fit(norm(Xtr), ytr, validation_data=val, epochs=epocas or 200, batch_size=64, verbose=0,
              callbacks=cbs, shuffle=True)
    melhor = int(np.argmin(h.history['val_loss'])) + 1 if va is not None else epocas
    return m, media, desvio, melhor


def prever(m, media, desvio, itens):
    X = np.stack([dados.sequencia_de(it) for it, _ in itens])
    return m.predict((X - media) / desvio, verbose=0)


def tabela_limiares(prob, y):
    conf, pred = prob.max(1), prob.argmax(1)
    linhas = []
    for lim in [0.0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]:
        ac = conf >= lim
        cob = ac.mean()
        prec = (pred[ac] == y[ac]).mean() if ac.any() else float('nan')
        linhas.append(dict(limiar=lim, cobertura=float(cob), acuracia_aceitos=float(prec)))
    return linhas


def escolher_limiar(prob, y):
    conf, pred = prob.max(1), prob.argmax(1)
    for lim in np.arange(0.30, 0.99, 0.01):
        ac = conf >= lim
        if ac.sum() >= 0.3 * len(y) and (pred[ac] == y[ac]).mean() >= PRECISAO_ALVO_LIMIAR:
            return float(round(lim, 2))
    return 0.90


def exportar(m, media, desvio, sinais, limiar, resumo, experimentais=frozenset()):
    def b64(a):
        return base64.b64encode(np.asarray(a, '<f4').tobytes()).decode()
    ent, lstm, sai = m.get_layer('entrada'), m.get_layer('lstm'), m.get_layer('saida')
    W1, b1 = ent.get_weights()
    Wl, Ul, bl = lstm.get_weights()
    W2, b2 = sai.get_weights()
    modelo = dict(
        versao=1, tipo='lstm-sinais-dinamicos', aprovado=True, criado=time.strftime('%Y-%m-%d'),
        sinais=[dict(id=s, palavra=p, **({'experimental': True} if s in experimentais else {})) for s, p in sinais],
        passos=C.T_PASSOS, n_carac=C.N_CARAC,
        limiar=limiar, limiar_experimental=max(limiar, config.LIMIAR_EXPERIMENTAL), media=b64(media), desvio=b64(desvio),
        camadas=dict(entrada=dict(W=b64(W1), b=b64(b1), forma=list(W1.shape)),
                     lstm=dict(W=b64(Wl), U=b64(Ul), b=b64(bl), unidades=int(Ul.shape[0])),
                     saida=dict(W=b64(W2), b=b64(b2), forma=list(W2.shape))),
        metricas=resumo, fonte=config.FONTE_MINDS + (' ' + config.FONTE_INES if resumo.get('ines') else ''),
    )
    APP.parent.mkdir(parents=True, exist_ok=True)
    APP.write_text(json.dumps(modelo, ensure_ascii=False), encoding='utf-8')
    return APP


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sem-proprias', action='store_true')
    ap.add_argument('--sem-ines', action='store_true', help='treina sem o Dicionário do INES')
    ap.add_argument('--experimentais', action='store_true', help='inclui as palavras do app que só o INES tem')
    ap.add_argument('--teste', nargs='*', help='pessoas de teste (padrão: 2 sorteadas entre as completas da MINDS)')
    a = ap.parse_args()
    rng = np.random.default_rng(SEMENTE)
    t0 = time.time()

    itens = dados.carregar_gravacoes(incluir_proprias=not a.sem_proprias, incluir_ines=not a.sem_ines,
                                     experimentais=a.experimentais and not a.sem_ines)
    descartados = [it for it in itens if 'descartado' in it]
    todos = [it for it in itens if 'descartado' not in it]
    exp_itens = [it for it in todos if it.get('experimental')]
    itens = [it for it in todos if not it.get('experimental')]  # os que passam pela avaliação
    exp_sinais = {it['sinal'] for it in exp_itens}
    por_sinal_exp = Counter(it['sinal'] for it in exp_itens)
    for it in exp_itens:
        it['aumentos'] = max(AUMENTOS_POR_AMOSTRA, -(-SEQUENCIAS_POR_SINAL_EXPERIMENTAL // por_sinal_exp[it['sinal']]) - 1)
    rotulos = sorted({(it['sinal'], it['palavra']) for it in todos}, key=lambda x: x[0])
    idx = {s: k for k, (s, _) in enumerate(rotulos)}
    avaliados = [k for k, (s, _) in enumerate(rotulos) if s not in exp_sinais]
    exp_amostras = [(it, idx[it['sinal']]) for it in exp_itens]
    if exp_itens:
        print(f'{len(exp_sinais)} sinais experimentais ({len(exp_itens)} vídeos do INES), só no treino')
    pessoas = sorted({it['pessoa'] for it in itens})
    por_pessoa = Counter(it['pessoa'] for it in itens)
    print(f'{len(itens)} gravações, {len(rotulos)} sinais, {len(pessoas)} pessoas ({len(descartados)} descartadas)')

    # pessoas de teste: completas (gravaram todos os sinais) e da MINDS
    sinais_por_pessoa = defaultdict(set)
    for it in itens:
        sinais_por_pessoa[it['pessoa']].add(it['sinal'])
    completas = [p for p in pessoas if p.startswith('minds-') and len(sinais_por_pessoa[p]) == len(avaliados)]
    teste = a.teste or sorted(rng.choice(completas, 2, replace=False).tolist())
    resto = [p for p in pessoas if p not in teste]
    if len(resto) < 4:
        raise SystemExit('Poucas pessoas para separar treino/validação/teste por pessoa.')

    def amostras(ps):
        return [(it, idx[it['sinal']]) for it in itens if it['pessoa'] in ps]

    # --- Validação cruzada agrupada por pessoa ---
    base = amostras(resto)
    grupos = np.array([it['pessoa'] for it, _ in base])
    y_base = np.array([c for _, c in base])
    oof = np.zeros((len(base), len(rotulos)), np.float32)
    dobras, epocas = [], []
    for k, (itr, iva) in enumerate(GroupKFold(n_splits=min(5, len(resto))).split(base, y_base, grupos)):
        tr, va = [base[i] for i in itr], [base[i] for i in iva]
        m, mu, sd, melhor = treinar_modelo(tr + exp_amostras, va, len(rotulos), rng)
        p = prever(m, mu, sd, va)
        oof[iva] = p
        yv = y_base[iva]
        dobras.append(dict(dobra=k + 1, pessoas_validacao=sorted(str(g) for g in set(grupos[iva])), melhor_epoca=melhor,
                           acuracia=float((p.argmax(1) == yv).mean()),
                           f1_macro=float(f1_score(yv, p.argmax(1), labels=avaliados, average='macro', zero_division=0))))
        epocas.append(melhor)
        print(f"dobra {k + 1}: {dobras[-1]['pessoas_validacao']} acc={dobras[-1]['acuracia']:.3f} "
              f"f1={dobras[-1]['f1_macro']:.3f} épocas={melhor} ({time.time() - t0:.0f}s)")
    limiar = escolher_limiar(oof, y_base)

    # --- Modelo final e TESTE (usado uma única vez) ---
    ep_final = int(np.median(epocas))
    m, mu, sd, _ = treinar_modelo(base + exp_amostras, None, len(rotulos), rng, epocas=ep_final)
    te = amostras(teste)
    yt = np.array([c for _, c in te])
    pt = prever(m, mu, sd, te)
    pred = pt.argmax(1)
    P, R, F, N = precision_recall_fscore_support(yt, pred, labels=avaliados, zero_division=0)
    acc = float((pred == yt).mean())
    f1m = float(f1_score(yt, pred, labels=avaliados, average='macro', zero_division=0))
    para_experimental = int(sum(1 for k in pred if rotulos[k][0] in exp_sinais))
    conf = pt.max(1)
    aceitos = conf >= limiar
    por_pessoa_teste = {p: float((pred[[it['pessoa'] == p for it, _ in te]] == yt[[it['pessoa'] == p for it, _ in te]]).mean())
                        for p in teste}
    criterios = dict(acuracia=acc >= APROVACAO['acuracia'], f1_macro=f1m >= APROVACAO['f1_macro'],
                     recall_min_por_sinal=float(R.min()) >= APROVACAO['recall_min_por_sinal'])
    aprovado = all(criterios.values())

    resumo = dict(
        teste=dict(pessoas=teste, amostras=len(te), acuracia=acc, f1_macro=f1m,
                   acuracia_aceitos=float((pred[aceitos] == yt[aceitos]).mean()) if aceitos.any() else None,
                   cobertura_no_limiar=float(aceitos.mean())),
        validacao_cruzada=dict(acuracia_media=float(np.mean([d['acuracia'] for d in dobras])),
                               acuracia_desvio=float(np.std([d['acuracia'] for d in dobras])),
                               f1_macro_media=float(np.mean([d['f1_macro'] for d in dobras]))),
        limiar=limiar, aprovado=aprovado,
        ines=sum(1 for it in todos if it['origem'] == 'ines'),
        experimentais=len(exp_sinais),
    )
    rel = dict(
        data=time.strftime('%Y-%m-%d %H:%M'), semente=SEMENTE, criterios_aprovacao=APROVACAO, criterios_resultado=criterios,
        aprovado=aprovado, resumo=resumo,
        dados=dict(gravacoes=len(todos), descartadas=[dict(arquivo=d['arquivo'], motivo=d['descartado']) for d in descartados],
                   pessoas={p: por_pessoa[p] for p in pessoas}, sinais=[p for s, p in rotulos if s not in exp_sinais],
                   experimentais=[dict(sinal=p, videos=por_sinal_exp[s]) for s, p in rotulos if s in exp_sinais],
                   treino_validacao=resto, teste=teste),
        dobras=dobras, epocas_modelo_final=ep_final,
        limiares_validacao=tabela_limiares(oof, y_base), limiares_teste=tabela_limiares(pt, yt),
        por_sinal=[dict(sinal=rotulos[k][1], precisao=float(P[j]), recall=float(R[j]), f1=float(F[j]), n=int(N[j]))
                   for j, k in enumerate(avaliados)],
        por_pessoa_teste=por_pessoa_teste,
        teste_previsto_como_experimental=para_experimental,
        confusao=confusion_matrix(yt, pred, labels=avaliados).tolist(),
        duracao_s=round(time.time() - t0),
    )
    RELATORIOS.mkdir(exist_ok=True)
    (RELATORIOS / 'sinais-dinamicos.json').write_text(json.dumps(rel, ensure_ascii=False, indent=1), encoding='utf-8')
    (RELATORIOS / 'sinais-dinamicos.md').write_text(relatorio_md(rel, [rotulos[k] for k in avaliados]), encoding='utf-8')
    config.SAIDA.mkdir(parents=True, exist_ok=True)
    m.save(config.SAIDA / 'sinais-dinamicos.keras')
    np.savez(config.SAIDA / 'normalizacao.npz', media=mu, desvio=sd, limiar=limiar)

    print(f'TESTE {teste}: acurácia {acc:.3f}, F1 macro {f1m:.3f}, recall mínimo {R.min():.2f}; limiar {limiar}')
    if aprovado:
        print('APROVADO — exportado para', exportar(m, mu, sd, rotulos, limiar, resumo, exp_sinais))
    else:
        if APP.exists():
            APP.unlink()  # nunca deixar no app um modelo que não passou na avaliação atual
        print('REPROVADO nos critérios', {k: v for k, v in criterios.items() if not v}, '— nada foi exportado para o app.')
    print('Relatório:', RELATORIOS / 'sinais-dinamicos.md')


def relatorio_md(r, rotulos):
    s = r['resumo']
    L = [f"# Relatório — sinais dinâmicos (LSTM)", '',
         f"Gerado em {r['data']} por `ml/treinar.py` (semente {r['semente']}).", '',
         f"**Resultado: {'APROVADO para uso no app' if r['aprovado'] else 'REPROVADO — não exportado para o app'}**", '',
         '## Protocolo', '',
         '- Dados: MINDS-Libras (CC BY 4.0, UFMG), Dicionário da Libras do INES (uma pessoa, só no treino, uma variante por sinal) e gravações próprias, quando houver. Só sinais gravados de verdade.',
         '- Divisão **por pessoa**: ninguém aparece em mais de um conjunto.',
         f"- Teste (usado uma vez, no fim): {', '.join(s['teste']['pessoas'])}.",
         f"- Treino/validação: {', '.join(r['dados']['treino_validacao'])} — validação cruzada agrupada por pessoa (5 dobras).",
         f"- Modelo final treinado com {r['epocas_modelo_final']} épocas (mediana das dobras).", '',
         '## Resultados', '',
         '| Conjunto | Acurácia | F1 macro |', '|---|---|---|',
         f"| Validação cruzada (média ± desvio) | {s['validacao_cruzada']['acuracia_media']:.1%} ± {s['validacao_cruzada']['acuracia_desvio']:.1%} | {s['validacao_cruzada']['f1_macro_media']:.3f} |",
         f"| **Teste (pessoas nunca vistas)** | **{s['teste']['acuracia']:.1%}** | **{s['teste']['f1_macro']:.3f}** |", '',
         f"Limiar de confiança (escolhido na validação, não no teste): **{s['limiar']:.2f}**. "
         f"No teste, {s['teste']['cobertura_no_limiar']:.0%} das gravações ficam acima dele"
         + (f", com {s['teste']['acuracia_aceitos']:.1%} de acerto entre elas." if s['teste']['acuracia_aceitos'] is not None else '.'),
         '', '### Critérios de aprovação (no teste)', '']
    for k, v in r['criterios_aprovacao'].items():
        L.append(f"- {k} ≥ {v}: {'ok' if r['criterios_resultado'][k] else 'NÃO'}")
    L += ['', '### Por dobra', '', '| Dobra | Pessoas de validação | Acurácia | F1 | Épocas |', '|---|---|---|---|---|']
    for d in r['dobras']:
        L.append(f"| {d['dobra']} | {', '.join(d['pessoas_validacao'])} | {d['acuracia']:.1%} | {d['f1_macro']:.3f} | {d['melhor_epoca']} |")
    L += ['', '### Por pessoa de teste', '']
    for p, v in r['por_pessoa_teste'].items():
        L.append(f'- {p}: {v:.1%}')
    L += ['', '### Por sinal (teste)', '', '| Sinal | Precisão | Recall | F1 | n |', '|---|---|---|---|---|']
    for x in r['por_sinal']:
        L.append(f"| {x['sinal']} | {x['precisao']:.2f} | {x['recall']:.2f} | {x['f1']:.2f} | {x['n']} |")
    L += ['', '### Limiar × cobertura', '', '| Limiar | Cobertura (val) | Acerto aceitos (val) | Cobertura (teste) | Acerto aceitos (teste) |', '|---|---|---|---|---|']
    for a, b in zip(r['limiares_validacao'], r['limiares_teste']):
        L.append(f"| {a['limiar']:.2f} | {a['cobertura']:.0%} | {a['acuracia_aceitos']:.1%} | {b['cobertura']:.0%} | {b['acuracia_aceitos']:.1%} |")
    nomes = [p for _, p in rotulos]
    L += ['', '### Matriz de confusão (teste; linhas = real, colunas = previsto)', '',
          '| | ' + ' | '.join(n[:4] for n in nomes) + ' |', '|---' * (len(nomes) + 1) + '|']
    for n, linha in zip(nomes, r['confusao']):
        L.append(f'| {n} | ' + ' | '.join(str(v) if v else '·' for v in linha) + ' |')
    if r['dados'].get('experimentais'):
        exp = r['dados']['experimentais']
        L += ['', f'## Sinais experimentais ({len(exp)})', '',
              f"Vêm só do Dicionário do INES (uma pessoa; {sum(e['videos'] for e in exp)} vídeos). Ficaram no treino e "
              'NÃO têm medida de acerto: não existem gravações de outras pessoas para testar. No app, só são aceitos com '
              'confiança alta e aparecem como experimentais.',
              f"No teste, {r.get('teste_previsto_como_experimental', 0)} das gravações dos sinais avaliados foram "
              'confundidas com algum sinal experimental (já contadas como erro acima).', '',
              ', '.join(e['sinal'] for e in exp)]
    L += ['', '## Dados', '', f"{r['dados']['gravacoes']} gravações usadas; {len(r['dados']['descartadas'])} descartadas (nenhuma mão detectada).", '',
          '| Pessoa | Gravações |', '|---|---|'] + [f'| {p} | {n} |' for p, n in r['dados']['pessoas'].items()]
    L += ['', '## Limitações (leia antes de usar)', '',
          '- O modelo só conhece estes sinais. Qualquer outro gesto pode ser confundido com um deles; o limiar reduz, mas não elimina, isso (não há exemplos de "outros gestos" no treino).',
          '- Gravações da MINDS: fundo verde, câmera fixa, iluminação de estúdio, pessoa de corpo inteiro até a cintura. Na câmera do celular a acurácia tende a ser menor; grave exemplos próprios (`ml/gravar.py`) e retreine.',
          '- O sinal precisa começar e terminar com as mãos abaixadas (fora da imagem), como nas gravações.',
          '- Expressões faciais não são usadas.',
          '', f"Fontes: {config.FONTE_MINDS} {config.FONTE_INES if r['resumo'].get('ines') else ''}", '']
    return '\n'.join(L)


if __name__ == '__main__':
    main()
