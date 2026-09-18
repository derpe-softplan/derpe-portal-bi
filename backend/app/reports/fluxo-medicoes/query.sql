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
municipios AS (
    SELECT
        c.skcontrato,
        STRING_AGG(DISTINCT m.nmmunicipio, ', ' ORDER BY m.nmmunicipio) AS municipios
    FROM siderdwh.ebisfobramunicipio om
    JOIN siderdwh.ebisdobracontrato doc ON doc.skobra = om.skobra
    JOIN siderdwh.ebisdcontrato c       ON c.nutitulo  = doc.nutitulo
    JOIN siderdwh.ebisdmunicipio m      ON m.skmunicipio = om.skmunicipio
    WHERE om.skmunicipio <> 0
    GROUP BY c.skcontrato
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
    STRING_AGG(
        DISTINCT COALESCE(su.nmfantasia, su.nmsujeito),
        '; '
        ORDER BY COALESCE(su.nmfantasia, su.nmsujeito)
    ) AS empresas
FROM siderdwh.ebisfsujeitocontrato sc
JOIN siderdwh.ebisdsujeito su
    ON su.sksujeito = sc.sksujeito
GROUP BY sc.skcontrato
),
tipo_contrato as (
	select 
	skcontrato,
	ai.deagregadoritem
	from siderdwh.ebisfagregadorcontrato ac
	left join siderdwh.ebisdagregadoritemcontrato ai on ai.skagregadoritem = ac.skagregadoritem 
	where ai.cdagregador = 1
),
empenho_contrato AS (
    SELECT
        skcontrato,
        COALESCE(SUM(vlliquido), 0) AS vlliquido_empenho
    FROM siderdwh.ebisfaofempenho
    GROUP BY skcontrato
),
executado_contrato AS (
    SELECT
        mc.skcontrato,
        COALESCE(SUM(la.vlliquidado), 0) AS valor_executado
    FROM siderdwh.ebisfmedicaocontrato mc
    LEFT JOIN liquidacao_agg la ON la.skmedicao = mc.skmedicao
    GROUP BY mc.skcontrato
),
ultima_medicao_valor AS (
    SELECT DISTINCT ON (mc.skcontrato)
        mc.skcontrato,
        COALESCE(mca.valor_medido + mca.valor_reajuste, 0) AS ultimo_vlevento
    FROM siderdwh.ebisfmedicaocontrato mc
    JOIN mcc_agregado mca ON mca.skmedicao = mc.skmedicao
    WHERE mc.flaprovada = 'S'
    ORDER BY mc.skcontrato, mc.skmedicao DESC
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
        mun.municipios,
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
        tc.deagregadoritem,
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
        td_ultimopgto.dttempo AS dt_ultimo_pgto,
        ec.vlliquido_empenho,
        xc.valor_executado,
        um.ultimo_vlevento                              AS ultimo_vlevento_contrato,
        td_fimexec.dttempo                              AS dt_fim_execucao
    FROM siderdwh.ebisfmedicaocontrato mc
    LEFT JOIN siderdwh.ebisdmedicaocontrato mdc    ON mdc.skmedicao = mc.skmedicao
    LEFT JOIN siderdwh.ebisdsituacaomedicao sm     ON sm.sksituacaomedicao = mc.sksituacaomedicao
    LEFT JOIN mcc_agregado mca            ON mca.skmedicao = mc.skmedicao
    LEFT JOIN medhist_andamento hi        ON hi.skcontrato = mc.skcontrato AND hi.skmedicao = mc.skmedicao
    LEFT JOIN assinatura a                ON a.skmedicao = mc.skmedicao
    LEFT JOIN rodovias r                  ON r.skcontrato = mc.skcontrato
    LEFT JOIN municipios mun              ON mun.skcontrato = mc.skcontrato
    LEFT JOIN notas_agg na                ON na.skmedicao = mc.skmedicao
    LEFT JOIN liquidacao_agg lq           ON lq.skmedicao = mc.skmedicao
    LEFT JOIN pagamento_agg pg            ON pg.skmedicao = mc.skmedicao
    LEFT JOIN siderdwh.ebisdcontrato c             ON c.skcontrato = mc.skcontrato
    left join tipo_contrato tc						on tc.skcontrato = mc.skcontrato 
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
    LEFT JOIN empenho_contrato ec               ON ec.skcontrato = mc.skcontrato
    LEFT JOIN executado_contrato xc             ON xc.skcontrato = mc.skcontrato
    LEFT JOIN ultima_medicao_valor um           ON um.skcontrato = mc.skcontrato
    LEFT JOIN siderdwh.ebisdtempo td_fimexec    ON td_fimexec.sktempo = NULLIF(fc.sktempofimexecucaoaditivo, 0)
)
SELECT
    m.cdtitulo                                                             AS "Contrato",
    m.nuseqmedicaoh                                                        AS "Medição",
    m.cdtitulo || '|' || m.nuseqmedicaoh::text                             AS "MedicaoId",
    m.skmedicao                                                            AS "SkMedicao",
    m.deobjetoresumido                                                     AS "Objeto",
    m.denaturezacontrato                                                   AS "Natureza",
    m.rodovias                                                             AS "Rodovias",
    m.municipios                                                           AS "Municípios",
    m.flaprovada                                                           AS "Aprovada?",
    CASE
        WHEN m.flaprovada IS DISTINCT FROM 'S' AND COALESCE(m.vlevento, 0) = 0  THEN 'Criada'
        WHEN m.flaprovada IS DISTINCT FROM 'S' AND COALESCE(m.vlevento, 0) <> 0 THEN 'Iniciada'
        WHEN m.flaprovada = 'S' AND COALESCE(m.qt_faltam, 0) > 0 THEN 'Assinatura pendente'
        WHEN m.flaprovada = 'S' AND COALESCE(m.qt_faltam, 0) = 0 THEN 'Finalizada'
        ELSE 'Criada'
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
   	m.deagregadoritem                                                      AS "Tipo de contrato",
    m.empresas                                                             AS "Empresa",
    m.nmorgaosetor                                                         AS "Distrito",
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
        -- flaprovada <> 'S' cobre 'N', NULL e qualquer outro valor inesperado
        WHEN m.flaprovada IS DISTINCT FROM 'S' AND COALESCE(m.vlevento, 0) = 0  THEN 'Criada'
        WHEN m.flaprovada IS DISTINCT FROM 'S' AND COALESCE(m.vlevento, 0) <> 0 THEN 'Iniciada'
        WHEN m.flaprovada = 'S' AND COALESCE(m.qt_faltam, 0) > 0 THEN 'Assinatura pendente'
        WHEN COALESCE(m.qt_notas, 0) > 0 AND COALESCE(m.vlliquidado, 0) = 0 THEN 'Nota emitida'
        WHEN COALESCE(m.vlliquidado, 0) > 0 AND COALESCE(m.vlpago, 0) = 0 THEN 'Liquidada'
        -- vlevento pode ser NULL (sem linha em mcc_agregado); usar COALESCE evita comparação NULL
        WHEN COALESCE(m.vlpago, 0) > 0 AND COALESCE(m.vlpago, 0) < COALESCE(m.vlevento, 0) THEN 'Paga parcialmente'
        WHEN COALESCE(m.vlpago, 0) > 0 THEN 'Paga integralmente'
        ELSE 'Criada'
    END                                                                     AS "Etapa Atual da Jornada",
    m.dt_fim_execucao                                                        AS "Data Fim Execução",
    m.vlliquido_empenho                                                      AS "Empenho Total",
    m.valor_executado                                                        AS "Valor Executado",
    (COALESCE(m.vlliquido_empenho, 0) - COALESCE(m.valor_executado, 0))     AS "Saldo Empenho",
    m.ultimo_vlevento_contrato                                               AS "Último Valor Medido (Contrato)",
    CASE
        WHEN (COALESCE(m.vlliquido_empenho, 0) - COALESCE(m.valor_executado, 0))
             < COALESCE(m.ultimo_vlevento_contrato, 0)
             AND COALESCE(m.ultimo_vlevento_contrato, 0) > 0
        THEN 'Insuficiente'
        ELSE 'Suficiente'
    END                                                                      AS "Saldo para Próxima Medição"
FROM medicao m
ORDER BY 1, 2;
