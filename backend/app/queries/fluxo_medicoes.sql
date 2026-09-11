WITH medhist_andamento AS (
    SELECT
        mch.skcontrato,
        mch.skmedicao,
        MIN(mch.sktemposituacaomedicao) AS sktempoandamento
    FROM siderdwh.ebisfmedicaocontratohistorico mch
    WHERE mch.nmsituacao = 'ANDAMENTO'
    GROUP BY mch.skcontrato, mch.skmedicao
),
mcc_correto AS (
    -- Regra de tipo de cálculo já validada: usar sktipocalculomedicao=5;
    -- cair para 1 só quando a medição não tem nenhuma linha tipo 5.
    SELECT mcc.skmedicao, mcc.nuseqmedicao, mcc.vlcalculado
    FROM siderdwh.ebisfmedicaocontratocalculo mcc
    WHERE mcc.sktipocalculomedicao = 5
       OR (
            mcc.sktipocalculomedicao = 1
            AND NOT EXISTS (
                SELECT 1
                FROM siderdwh.ebisfmedicaocontratocalculo c2
                WHERE c2.skmedicao = mcc.skmedicao
                  AND c2.sktipocalculomedicao = 5
            )
        )
),
mcc_agregado AS (
    SELECT
        skmedicao,
        COALESCE(SUM(CASE WHEN nuseqmedicao = 1 THEN vlcalculado END), 0) AS valor_medido,
        COALESCE(SUM(CASE WHEN nuseqmedicao > 1 THEN vlcalculado END), 0) AS valor_reajuste
    FROM mcc_correto
    GROUP BY skmedicao
),
assinatura AS (
    SELECT
        ad.skmedicao,
        COUNT(DISTINCT CASE WHEN ad.nmsituacao = 'ASSINADO' THEN ad.skfiscal END) AS qt_assinaram,
        COUNT(DISTINCT CASE WHEN ad.nmsituacao <> 'ASSINADO' THEN ad.skfiscal END) AS qt_faltam,
        COUNT(DISTINCT ad.skfiscal)                                              AS qt_ass,
        STRING_AGG(
            DISTINCT CASE WHEN ad.nmsituacao = 'ASSINADO' THEN df.nmfiscal END,
            ', ' ORDER BY CASE WHEN ad.nmsituacao = 'ASSINADO' THEN df.nmfiscal END
        ) AS assinaram,
        STRING_AGG(
            DISTINCT CASE WHEN ad.nmsituacao <> 'ASSINADO' THEN df.nmfiscal END,
            ', ' ORDER BY CASE WHEN ad.nmsituacao <> 'ASSINADO' THEN df.nmfiscal END
        ) AS faltam_assinar
    FROM siderdwh.ebisfmedicaoassinatura ad
    JOIN siderdwh.ebisdfiscal df ON df.skfiscal = ad.skfiscal
    WHERE ad.flactive = 'S'
    GROUP BY ad.skmedicao
),
rodovias AS (
    -- Agregada por skcontrato (produção também agrega por NUTITULO, ignorando lote).
    SELECT
        t.skcontrato,
        STRING_AGG(DISTINCT r.sgrodovia, ', ' ORDER BY r.sgrodovia) AS rodovias
    FROM siderdwh.ebisftrechorodoviaobracontrato t
    JOIN siderdwh.ebisdrodovia r ON r.skrodovia = t.skrodovia
    WHERE t.flactive = 'S'
    GROUP BY t.skcontrato
),
notas_agg AS (
    SELECT
        dm.skmedicao,
        COUNT(*)                                                               AS qt_notas,
        SUM(dm.vldocumento)                                                    AS vlnotas,
        MIN(NULLIF(dm.sktempodocumentomedicao, 0))                             AS sktempoprimeiranota,
        MAX(NULLIF(dm.sktempodocumentomedicao, 0))                             AS sktempoultimanota,
        MIN(CASE WHEN dm.sksituacaodocumentomedicao = 8 THEN 1 ELSE 0 END)     AS fltodaspagas
    FROM siderdwh.ebisfaofdocumentomedicao dm
    WHERE dm.flactive = 'S'
    GROUP BY dm.skmedicao
),
liquidacao AS (
    SELECT
        dm.skmedicao,
        li.skempenholiquidacao,
        li.vlliquidado,
        li.sktempoempenholiquidacao
    FROM siderdwh.ebisfaofempenholiquidacaoitem li
    JOIN siderdwh.ebisfaofdocumentomedicao dm ON dm.skdocumentomedicao = li.skdocumentomedicao
    WHERE li.flactive = 'S'
),
liquidacao_agg AS (
    SELECT
        skmedicao,
        COUNT(DISTINCT skempenholiquidacao)  AS qt_liquidacoes,
        SUM(vlliquidado)                     AS vlliquidado,
        MAX(NULLIF(sktempoempenholiquidacao, 0)) AS sktempoultimaliq
    FROM liquidacao
    GROUP BY skmedicao
),
pagamento AS (
    SELECT
        l.skmedicao,
        pi.skpagamento,
        pi.nuseqpagamentoitem,
        pi.vlpagamento,
        pi.sktempopagamento
    FROM liquidacao l
    JOIN siderdwh.ebisfaofpagamentoitem pi ON pi.skempenholiquidacao = l.skempenholiquidacao
    WHERE pi.flactive = 'S'
),
pagamento_agg AS (
    SELECT
        skmedicao,
        COUNT(DISTINCT skpagamento || '-' || nuseqpagamentoitem) AS qt_pagamentos,
        SUM(vlpagamento)                                          AS vlpago,
        MAX(NULLIF(sktempopagamento, 0))                          AS sktempoultimopgto
    FROM pagamento
    GROUP BY skmedicao
),
empresas AS (
    SELECT
        sc.skcontrato,
        STRING_AGG(DISTINCT su.nmsujeito, '; ' ORDER BY su.nmsujeito) AS empresas
    FROM siderdwh.ebisfsujeitocontrato sc
    JOIN siderdwh.ebisdsujeito su ON su.sksujeito = sc.sksujeito
    WHERE sc.flactive = 'S'
    GROUP BY sc.skcontrato
),
medicao AS (
    SELECT
        mc.skcontrato,
        mc.skmedicao,
        mdc.nuseqmedicaoh,
        mdc.nuprocessoinf   AS nuprocessoinf_medicao,
        mc.flaprovada,
        sm.flsituacao,
        sm.nmsituacao,
        mca.valor_medido,
        mca.valor_reajuste,
        (mca.valor_medido + mca.valor_reajuste) AS vlevento,
        a.qt_ass,
        a.qt_assinaram,
        a.qt_faltam,
        a.assinaram,
        a.faltam_assinar,
        r.rodovias,
        na.qt_notas,
        na.vlnotas,
        na.sktempoprimeiranota,
        lq.qt_liquidacoes,
        lq.vlliquidado,
        lq.sktempoultimaliq,
        pg.qt_pagamentos,
        pg.vlpago,
        pg.sktempoultimopgto,
        c.cdtitulo,
        c.deobjeto,
        c.deobjetoresumido,
        c.nuprocessoinf,
        nat.denaturezacontrato,
        os.nmorgaosetor,
        emp.empresas,
        td_medicao.dttempo    AS dt_medicao,
        td_inicio.dttempo     AS dt_inicio,
        td_fim.dttempo        AS dt_fim,
        td_aprovacao.dttempo  AS dt_aprovacao,
        td_sei.dttempo        AS dt_envio_sei,
        td_andamento.dttempo  AS dt_criacao,
        td_ultimaliq.dttempo  AS dt_ultima_liq,
        td_ultimopgto.dttempo AS dt_ultimo_pgto
    FROM siderdwh.ebisfmedicaocontrato mc
    LEFT JOIN siderdwh.ebisdmedicaocontrato mdc    ON mdc.skmedicao = mc.skmedicao
    LEFT JOIN siderdwh.ebisdsituacaomedicao sm     ON sm.sksituacaomedicao = mc.sksituacaomedicao
    LEFT JOIN mcc_agregado mca            ON mca.skmedicao = mc.skmedicao
    LEFT JOIN medhist_andamento hi        ON hi.skcontrato = mc.skcontrato AND hi.skmedicao = mc.skmedicao
    LEFT JOIN assinatura a                ON a.skmedicao = mc.skmedicao
    LEFT JOIN rodovias r                  ON r.skcontrato = mc.skcontrato
    LEFT JOIN notas_agg na                ON na.skmedicao = mc.skmedicao
    LEFT JOIN liquidacao_agg lq           ON lq.skmedicao = mc.skmedicao
    LEFT JOIN pagamento_agg pg            ON pg.skmedicao = mc.skmedicao
    LEFT JOIN siderdwh.ebisdcontrato c             ON c.skcontrato = mc.skcontrato
    LEFT JOIN siderdwh.ebisfcontrato fc            ON fc.skcontrato = mc.skcontrato
    LEFT JOIN siderdwh.ebisdnaturezacontrato nat   ON nat.sknaturezacontrato = fc.sknaturezacontrato
    LEFT JOIN siderdwh.ebisdorgaosetor os          ON os.skorgaosetor = fc.sksetor
    LEFT JOIN empresas emp                ON emp.skcontrato = mc.skcontrato
    LEFT JOIN siderdwh.ebisdtempo td_medicao       ON td_medicao.sktempo = NULLIF(mc.sktempomedicao, 0)
    LEFT JOIN siderdwh.ebisdtempo td_inicio        ON td_inicio.sktempo = NULLIF(mc.sktempoiniciomedicao, 0)
    LEFT JOIN siderdwh.ebisdtempo td_fim           ON td_fim.sktempo = NULLIF(mc.sktempofimmedicao, 0)
    LEFT JOIN siderdwh.ebisdtempo td_aprovacao     ON td_aprovacao.sktempo = NULLIF(mc.sktempoaprovacao, 0)
    LEFT JOIN siderdwh.ebisdtempo td_sei           ON td_sei.sktempo = NULLIF(mc.sktempoenviosei, 0)
    LEFT JOIN siderdwh.ebisdtempo td_andamento     ON td_andamento.sktempo = NULLIF(hi.sktempoandamento, 0)
    LEFT JOIN siderdwh.ebisdtempo td_ultimaliq     ON td_ultimaliq.sktempo = lq.sktempoultimaliq
    LEFT JOIN siderdwh.ebisdtempo td_ultimopgto    ON td_ultimopgto.sktempo = pg.sktempoultimopgto
)
SELECT
    m.cdtitulo                                                             AS "Contrato",
    m.nuseqmedicaoh                                                        AS "Medição",
    m.cdtitulo || '|' || m.nuseqmedicaoh::text                             AS "MedicaoId",
    m.deobjetoresumido                                                     AS "Objeto",
    m.denaturezacontrato                                                   AS "Natureza",
    m.rodovias                                                             AS "Rodovias",
    m.flaprovada                                                           AS "Aprovada?",
    CASE
        WHEN m.flaprovada = 'N' AND COALESCE(m.vlevento, 0) = 0  THEN 'Criada'
        WHEN m.flaprovada = 'N' AND COALESCE(m.vlevento, 0) <> 0 THEN 'Iniciada'
        WHEN m.flaprovada = 'S' AND COALESCE(m.qt_faltam, 0) > 0 THEN 'Assinatura pendente'
        WHEN m.flaprovada = 'S' AND COALESCE(m.qt_faltam, 0) = 0 THEN 'Finalizada'
        ELSE 'Indefinido'
    END                                                                     AS "Status",
    m.dt_medicao                                                           AS "Data da medição",
    m.dt_aprovacao                                                         AS "Data da aprovação",
    m.dt_inicio                                                            AS "Data início",
    m.dt_fim                                                               AS "Data Fim",
    m.valor_medido                                                         AS "Valor Medido",
    m.valor_reajuste                                                       AS "Valor Reajuste",
    m.vlevento                                                             AS "Valor Medido Reajustado",
    m.qt_ass                                                               AS "QT_ASS",
    m.qt_assinaram                                                         AS "QT_ASSINARAM",
    m.qt_faltam                                                            AS "QT_FALTAM",
    COALESCE(m.faltam_assinar, ' ')                                        AS "Assinatura Pendente",
    COALESCE(m.assinaram, ' ')                                             AS "Assinatura OK",
    COALESCE(m.nuprocessoinf_medicao, ' ')                                 AS "SEI",
    m.dt_envio_sei                                                         AS "Data do SEI",
    EXTRACT(YEAR FROM m.dt_fim)                                            AS "Ano",
    (ARRAY['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
           'Agosto','Setembro','Outubro','Novembro','Dezembro']
    )[EXTRACT(MONTH FROM m.dt_fim)::int]                                   AS "Mês",
    TO_CHAR(m.dt_fim, 'MM/YYYY')                                           AS "Mês/Ano",
    (EXTRACT(YEAR FROM m.dt_fim) * 100 + EXTRACT(MONTH FROM m.dt_fim))     AS "Ordem Mês/Ano",
    TO_CHAR(m.dt_inicio, 'MM/YYYY') || ' a ' || TO_CHAR(m.dt_fim, 'MM/YYYY') AS "Período",
    EXTRACT(YEAR FROM m.dt_criacao)                                        AS "Ano criação",
    (ARRAY['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
           'Agosto','Setembro','Outubro','Novembro','Dezembro']
    )[EXTRACT(MONTH FROM m.dt_criacao)::int]                                AS "Mês criação",
    CASE
        WHEN m.denaturezacontrato = 'Obra Rodoviária' THEN 'Obra Rodoviária'
        WHEN m.denaturezacontrato <> 'Obra Rodoviária'
             AND UPPER(m.deobjetoresumido) LIKE '%SUPERVISÃO%' THEN 'Supervisão'
        ELSE NULL
    END                                                                     AS "Tipo de contrato",
    CASE
        WHEN m.nmorgaosetor LIKE '%DRO%' THEN 'Distrito Rodoviário'
        ELSE 'Setor Administrativo'
    END                                                                     AS "Distrito/Setor",
    m.empresas                                                             AS "Empresa",
    m.nmorgaosetor                                                         AS "Diretoria",
    m.qt_notas                                                             AS "Qtd Notas",
    m.vlnotas                                                              AS "Valor Notas",
    m.qt_liquidacoes                                                       AS "Qtd Liquidações",
    m.vlliquidado                                                          AS "Valor Liquidado",
    m.dt_ultima_liq                                                        AS "Data Última Liquidação",
    m.qt_pagamentos                                                        AS "Qtd Pagamentos",
    m.vlpago                                                               AS "Valor Pago",
    m.dt_ultimo_pgto                                                       AS "Data Último Pagamento",
    CASE
        WHEN COALESCE(m.qt_notas, 0) = 0    THEN 'Sem nota emitida'
        WHEN COALESCE(m.vlliquidado, 0) = 0 THEN 'Nota emitida - aguardando liquidação'
        WHEN COALESCE(m.vlpago, 0) = 0      THEN 'Liquidada - aguardando pagamento'
        WHEN m.vlpago >= m.vlevento AND m.vlevento > 0 THEN 'Paga integralmente'
        ELSE 'Paga parcialmente'
    END                                                                     AS "Status Pagamento",
    CASE
        WHEN m.flaprovada = 'S' AND COALESCE(m.qt_faltam, 0) = 0 AND COALESCE(m.qt_notas, 0) = 0 THEN 'Finalizada - aguardando nota'
        WHEN m.flaprovada = 'N' AND COALESCE(m.vlevento, 0) = 0  THEN 'Criada'
        WHEN m.flaprovada = 'N' AND COALESCE(m.vlevento, 0) <> 0 THEN 'Iniciada'
        WHEN m.flaprovada = 'S' AND COALESCE(m.qt_faltam, 0) > 0 THEN 'Assinatura pendente'
        WHEN COALESCE(m.qt_notas, 0) > 0 AND COALESCE(m.vlliquidado, 0) = 0 THEN 'Nota emitida'
        WHEN COALESCE(m.vlliquidado, 0) > 0 AND COALESCE(m.vlpago, 0) = 0 THEN 'Liquidada'
        WHEN COALESCE(m.vlpago, 0) > 0 AND m.vlpago < m.vlevento THEN 'Paga parcialmente'
        WHEN COALESCE(m.vlpago, 0) >= m.vlevento AND m.vlevento > 0 THEN 'Paga integralmente'
        ELSE 'Indefinido'
    END                                                                     AS "Etapa Atual da Jornada"
FROM medicao m
--WHERE m.dt_criacao >= DATE '2026-06-01'
ORDER BY 1, 2;
