WITH
mcc_correto AS (
    SELECT mcc.skmedicao, mcc.nuseqmedicao, mcc.vlcalculado
    FROM siderdwh.ebisfmedicaocontratocalculo mcc
    WHERE mcc.sktipocalculomedicao = 5
       OR (
            mcc.sktipocalculomedicao = 1
            AND NOT EXISTS (
                SELECT 1 FROM siderdwh.ebisfmedicaocontratocalculo c2
                WHERE c2.skmedicao = mcc.skmedicao AND c2.sktipocalculomedicao = 5
            )
        )
),

vlmedido AS (
    SELECT skmedicao, SUM(vlcalculado) AS vlmedido
    FROM mcc_correto
    WHERE nuseqmedicao = 1
    GROUP BY skmedicao
),

vlreajuste AS (
    SELECT skmedicao, SUM(vlcalculado) AS vlreajuste
    FROM mcc_correto
    WHERE nuseqmedicao > 1
    GROUP BY skmedicao
),

-- NOVO: liquidações da medição, já trazendo o empenho de origem
liquidacao AS (
    SELECT
        dm.skmedicao,
        li.skempenholiquidacao,
        li.skempenho,   -- confirmar: é esse o nome da FK pro empenho?
        li.vlliquidado
    FROM siderdwh.ebisfaofempenholiquidacaoitem li
    JOIN siderdwh.ebisfaofdocumentomedicao dm ON dm.skdocumentomedicao = li.skdocumentomedicao
    WHERE li.flactive = 'S'
),

-- NOVO: pagamentos, herdando skmedicao/skempenho via liquidação
pagamento AS (
    SELECT
        l.skmedicao,
        l.skempenho,
        pi.skpagamento,
        pi.nuseqpagamentoitem,
        pi.vlpagamento
    FROM liquidacao l
    JOIN siderdwh.ebisfaofpagamentoitem pi ON pi.skempenholiquidacao = l.skempenholiquidacao
    WHERE pi.flactive = 'S'
),

-- NOVO: valor pago total + lista de empenhos usados, por medição
pagamento_medicao AS (
    SELECT
        p.skmedicao,
        SUM(p.vlpagamento) AS vlpago,
        STRING_AGG(DISTINCT de.nuempenho::text, ', ' ORDER BY de.nuempenho::text) AS empenhos_pagamento
    FROM pagamento p
    LEFT JOIN siderdwh.ebisdaofempenho de ON de.skempenho = p.skempenho
    GROUP BY p.skmedicao
)

SELECT
    dc.cdtitulo                                                     AS "Nº do contrato",
    dc.deobjetoresumido                                             AS "Objeto Reduzido",
    dmc.nuseqmedicaoh                                               AS "Nº do BM",
    TO_CHAR(ti.dttempo, 'DD/MM/YYYY')                               AS "Data inicial",
    TO_CHAR(tf.dttempo, 'DD/MM/YYYY')                               AS "Data final",
    vm.vlmedido                                                     AS "PI",
    vr.vlreajuste                                                   AS "PR",
    CASE
        WHEN mc.flaprovada = 'S' THEN 'Aprovada'
        WHEN mc.flaprovada = 'N' THEN 'Andamento'
    END                                                              AS "Status da medição",
    dmc.demedicao                                                   AS "Descrição da medição",
    CASE
        WHEN mc.flmedicaofinal = 'S' THEN 'Sim'
        WHEN mc.flmedicaofinal = 'N' THEN 'Não'
    END                                                              AS "Medição Final",
    pm.vlpago                                                       AS "Valor Pago",
    pm.empenhos_pagamento                                           AS "Empenhos do Pagamento"
FROM siderdwh.ebisfmedicaocontrato mc
LEFT JOIN siderdwh.ebisdmedicaocontrato dmc ON dmc.skmedicao = mc.skmedicao
LEFT JOIN siderdwh.ebisdcontrato dc          ON dc.skcontrato = mc.skcontrato
LEFT JOIN vlmedido vm                        ON vm.skmedicao = mc.skmedicao
LEFT JOIN vlreajuste vr                      ON vr.skmedicao = mc.skmedicao
LEFT JOIN siderdwh.ebisdtempo ti             ON ti.sktempo = NULLIF(mc.sktempoiniciomedicao, 0)
LEFT JOIN siderdwh.ebisdtempo tf             ON tf.sktempo = NULLIF(mc.sktempofimmedicao, 0)
LEFT JOIN pagamento_medicao pm               ON pm.skmedicao = mc.skmedicao
ORDER BY 1, 2;