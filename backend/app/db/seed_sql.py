FLUXO_MEDICOES_COMPLETA_SQL = """
WITH
MEDHIST_ANDAMENTO AS (
    SELECT
        NUTITULO,
        NUSEQMEDICAOH,
        MIN(DTSITUACAO) AS DTANDAMENTO
    FROM ESGMMEDICAOHIST
    WHERE NMSITUACAO = 'ANDAMENTO'
    GROUP BY
        NUTITULO,
        NUSEQMEDICAOH
),
MEDICAO AS (
    SELECT
        m.NUTITULO,
        m.NUSEQMEDICAOH,
        MAX(mh.FLSITUACAO)             AS SITUACAO,
        MAX(m.DTEVENTO)                AS DTEVENTO,
        MIN(mh.DTINIMEDICAO)           AS DTINIMEDICAO,
        MAX(mh.DTFIMMEDICAO)           AS DTFIMMEDICAO,
        MAX(m.FLAPROVADA)              AS FLAPROVADA,
        MAX(m.DTAPROVACAO)             AS DTAPROVACAO,
        SUM(CASE
                WHEN m.NUSEQMEDICAO = 1
                THEN m.VLEVENTO
                ELSE 0
            END) AS VLMEDIDO,
        SUM(CASE
                WHEN m.NUSEQMEDICAO > 1
                THEN m.VLEVENTO
                ELSE 0
            END) AS VLREAJUSTE,
        SUM(m.VLEVENTO)                AS VLEVENTO,
        MAX(m.NUPROCESSOINF)           AS SEI,
        MIN(hi.DTANDAMENTO)            AS DTCRIACAO
    FROM ESGMMEDICAO m
    LEFT JOIN ESGMMEDICAOH mh
        ON mh.NUTITULO = m.NUTITULO
       AND mh.NUSEQMEDICAOH = m.NUSEQMEDICAOH
    LEFT JOIN MEDHIST_ANDAMENTO hi
        ON hi.NUTITULO = m.NUTITULO
       AND hi.NUSEQMEDICAOH = m.NUSEQMEDICAOH
    GROUP BY
        m.NUTITULO,
        m.NUSEQMEDICAOH
),
ASSINATURA AS (
    SELECT ad.NUTITULO, ad.NUSEQMEDICAOH,
           COUNT(DISTINCT CASE WHEN ad.NMSITUACAO =  'ASSINADO' THEN ad.CDFISCAL END) AS QT_ASSINARAM,
           COUNT(DISTINCT CASE WHEN ad.NMSITUACAO <> 'ASSINADO' THEN ad.CDFISCAL END) AS QT_FALTAM,
           count(DISTINCT ad.CDFISCAL) AS QT_ASS,
           LISTAGG(DISTINCT CASE WHEN ad.NMSITUACAO =  'ASSINADO' THEN f.NMFISCAL END, ', ')
               WITHIN GROUP (ORDER BY f.NMFISCAL) AS ASSINARAM,
           LISTAGG(DISTINCT CASE WHEN ad.NMSITUACAO <> 'ASSINADO' THEN f.NMFISCAL END, ', ')
               WITHIN GROUP (ORDER BY f.NMFISCAL) AS FALTAM_ASSINAR
    FROM ESGMASSINATURADOCUMENTO ad
    JOIN ESGMFISCAL f ON f.CDFISCAL = ad.CDFISCAL
    GROUP BY ad.NUTITULO, ad.NUSEQMEDICAOH
),
SEI AS (
    SELECT NUTITULO, NUSEQMEDICAOH, MAX(DTEXECUCAO) DTENVIO_SEI
    FROM ESGMEXECUCAOASSINCRONA
    WHERE DETIPOEXECUCAO = 'ENVIAR_MEDICAO_SEI'
      AND DESITUACAO     = 'SUCESSO'
    GROUP BY NUTITULO, NUSEQMEDICAOH
),
RODOVIAS AS (
SELECT
    NUTITULO,
    LISTAGG(SGRODOVIA, ', ') WITHIN GROUP (ORDER BY SGRODOVIA) AS RODOVIAS
FROM VSGMMAPARODOVIASCONTRATO
GROUP BY NUTITULO
),
EMPRESAS AS (
    SELECT
        ts.NUTITULO,
        LISTAGG(s.NMSUJEITO, '; ')
            WITHIN GROUP (ORDER BY s.NMSUJEITO) AS EMPRESAS
    FROM ECTOTITULOSUJEITO ts
         JOIN ECDTSUJEITO s
           ON s.CDSUJEITO = ts.CDSUJEITO
    WHERE ts.FLFORAUSO = 'N'
    GROUP BY ts.NUTITULO
),
NATUREZA AS (
    SELECT
        c.NUTITULO,
        LISTAGG(DISTINCT n.DENATUREZACONTRATO, ', ')
            WITHIN GROUP (ORDER BY n.DENATUREZACONTRATO) AS NATUREZAS
    FROM ECTOCONTRATO c
    JOIN ECTOCONTRNATUREZA n
        ON n.CDNATUREZA = c.CDNATUREZA
        AND n.CDNATUREZACONTRATO = c.CDNATUREZACONTRATO
    GROUP BY c.NUTITULO
),
NOTAS AS (
    SELECT
        dm.NUTITULO,
        dm.NUSEQMEDICAOH,
        d.NUSEQDOCUMENTO,
        d.NUDOCUMENTO,
        d.CDTIPODOCUMENTO,
        d.CDSITDOCUMENTO,
        d.DTDOCUMENTO,
        d.VLDOCUMENTO,
        dm.VLFATURADO
    FROM ESFODOCMEDICAO dm
    JOIN ESFODOCUMENTO d
        ON d.NUTITULO       = dm.NUTITULO
       AND d.NUSEQDOCUMENTO = dm.NUSEQDOCUMENTO
),
NOTAS_AGG AS (
    SELECT
        NUTITULO,
        NUSEQMEDICAOH,
        COUNT(DISTINCT NUSEQDOCUMENTO)                                          AS QT_NOTAS,
        LISTAGG(DISTINCT NUDOCUMENTO, ', ') WITHIN GROUP (ORDER BY NUDOCUMENTO)  AS NOTAS_FISCAIS,
        SUM(VLDOCUMENTO)                                                        AS VLNOTAS,
        SUM(VLFATURADO)                                                         AS VLFATURADO,
        MIN(DTDOCUMENTO)                                                        AS DTPRIMEIRANOTA,
        MAX(DTDOCUMENTO)                                                        AS DTULTIMANOTA,
        MAX(CASE WHEN CDSITDOCUMENTO = 8 THEN 1 ELSE 0 END)                     AS FLTODASPAGAS
    FROM NOTAS
    GROUP BY NUTITULO, NUSEQMEDICAOH
),
LIQUIDACAO AS (
    SELECT
        n.NUTITULO,
        n.NUSEQMEDICAOH,
        n.NUSEQDOCUMENTO,
        li.NUANOORC,
        li.NUSEQEMPENHO,
        li.NUSEQLIQEMPENHO,
        li.VLLIQUIDADO,
        le.DTLIQEMPENHO
    FROM NOTAS n
    JOIN ESFOLIQEMPENHOITEM li
        ON li.NUTITULO        = n.NUTITULO
       AND li.NUSEQDOCUMENTO  = n.NUSEQDOCUMENTO
    JOIN ESFOLIQEMPENHO le
        ON le.NUANOORC        = li.NUANOORC
       AND le.NUSEQEMPENHO    = li.NUSEQEMPENHO
       AND le.NUSEQLIQEMPENHO = li.NUSEQLIQEMPENHO
),
LIQUIDACAO_AGG AS (
    SELECT
        NUTITULO,
        NUSEQMEDICAOH,
        COUNT(DISTINCT NUANOORC || '/' || NUSEQEMPENHO || '/' || NUSEQLIQEMPENHO) AS QT_LIQUIDACOES,
        SUM(VLLIQUIDADO)                                                         AS VLLIQUIDADO,
        MIN(DTLIQEMPENHO)                                                        AS DTPRIMEIRALIQ,
        MAX(DTLIQEMPENHO)                                                        AS DTULTIMALIQ
    FROM LIQUIDACAO
    GROUP BY NUTITULO, NUSEQMEDICAOH
),
PAGAMENTO AS (
    SELECT
        l.NUTITULO,
        l.NUSEQMEDICAOH,
        pi.NUANOPAGTO,
        pi.NUSEQPAGTO,
        pi.NUSEQPAGAMENTOITEM,
        pi.VLPAGAMENTO,
        p.DTPAGTO
    FROM LIQUIDACAO l
    JOIN ESFOPAGAMENTOITEM pi
        ON pi.NUANOORC        = l.NUANOORC
       AND pi.NUSEQEMPENHO    = l.NUSEQEMPENHO
       AND pi.NUSEQLIQEMPENHO = l.NUSEQLIQEMPENHO
    JOIN ESFOPAGAMENTO p
        ON p.NUANOPAGTO = pi.NUANOPAGTO
       AND p.NUSEQPAGTO = pi.NUSEQPAGTO
),
PAGAMENTO_AGG AS (
    SELECT
        NUTITULO,
        NUSEQMEDICAOH,
        COUNT(DISTINCT NUANOPAGTO || '/' || NUSEQPAGTO) AS QT_PAGAMENTOS,
        SUM(VLPAGAMENTO)                                 AS VLPAGO,
        MIN(DTPAGTO)                                      AS DTPRIMEIROPGTO,
        MAX(DTPAGTO)                                      AS DTULTIMOPGTO
    FROM PAGAMENTO
    GROUP BY NUTITULO, NUSEQMEDICAOH
)
SELECT
    t.CDTITULO AS "Contrato",
    m.NUSEQMEDICAOH AS "Medicao",
    T.CDTITULO || '|' || m.NUSEQMEDICAOH AS "MedicaoId",
    t.DEOBJETORESUMIDO AS "Objeto",
    nz.NATUREZAS AS "Natureza",
    r.RODOVIAS AS "Rodovias",
    m.FLAPROVADA AS "Aprovada",
    CASE
        WHEN m.FLAPROVADA = 'N' AND NVL(m.VLEVENTO, 0) = 0 THEN 'Criada'
        WHEN m.FLAPROVADA = 'N' AND NVL(m.VLEVENTO, 0) <> 0 THEN 'Iniciada'
        WHEN m.FLAPROVADA = 'S' AND NVL(a.QT_FALTAM, 0) > 0 THEN 'Assinatura pendente'
        WHEN m.FLAPROVADA = 'S' AND NVL(a.QT_FALTAM, 0) = 0 THEN 'Finalizada'
        ELSE 'Indefinido'
    END AS "Status",
    m.DTEVENTO AS "Data da medicao",
    m.DTAPROVACAO AS "Data da aprovacao",
    m.DTINIMEDICAO AS "Data inicio",
    m.DTFIMMEDICAO AS "Data Fim",
    m.VLMEDIDO AS "Valor Medido",
    m.VLREAJUSTE AS "Valor Reajuste",
    m.VLEVENTO AS "Valor Medido Reajustado",
    a.QT_ASS,
    a.QT_ASSINARAM,
    a.QT_FALTAM,
    NVL(a.FALTAM_ASSINAR, ' ') AS "Assinatura Pendente",
    NVL(a.ASSINARAM, ' ') AS "Assinatura OK",
    NVL(m.SEI, ' ') AS "SEI",
    s.DTENVIO_SEI AS "Data do SEI",
    EXTRACT(YEAR FROM m.DTFIMMEDICAO) AS "Ano",
    TO_CHAR(m.DTFIMMEDICAO, 'Month', 'NLS_DATE_LANGUAGE=PORTUGUESE') AS "Mes",
    TO_CHAR(m.DTFIMMEDICAO, 'MM/YYYY') AS "Mes/Ano",
    (EXTRACT(YEAR FROM m.DTFIMMEDICAO) * 100 + EXTRACT(MONTH FROM m.DTFIMMEDICAO)) AS "Ordem Mes/Ano",
    TO_CHAR(m.DTINIMEDICAO, 'MM/YYYY') || ' a ' || TO_CHAR(m.DTFIMMEDICAO, 'MM/YYYY') AS "Periodo",
    EXTRACT(YEAR FROM m.DTCRIACAO) AS "Ano criacao",
    TO_CHAR(m.DTCRIACAO, 'Month', 'NLS_DATE_LANGUAGE=PORTUGUESE') AS "Mes criacao",
    CASE
        WHEN nz.NATUREZAS = 'Obra Rodoviaria' THEN 'Obra Rodoviaria'
        WHEN nz.NATUREZAS <> 'Obra Rodoviaria' AND UPPER(t.DEOBJETORESUMIDO) LIKE '%SUPERVISAO%' THEN 'Supervisao'
        ELSE NULL
    END AS "Tipo de contrato",
    CASE
        WHEN (
            CASE
                WHEN m.FLAPROVADA = 'N' AND NVL(m.VLEVENTO,0) = 0 THEN 'Criada'
                WHEN m.FLAPROVADA = 'N' AND NVL(m.VLEVENTO,0) <> 0 THEN 'Iniciada'
                WHEN m.FLAPROVADA = 'S' AND NVL(a.QT_FALTAM,0) > 0 THEN 'Assinatura pendente'
                WHEN m.FLAPROVADA = 'S' AND NVL(a.QT_FALTAM,0) = 0 THEN 'Finalizada'
                ELSE 'Indefinido'
            END
        ) <> 'Finalizada'
        AND TRUNC(m.DTFIMMEDICAO, 'MM') < ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -1)
        THEN 'Atrasada'
        WHEN (
            CASE
                WHEN m.FLAPROVADA = 'N' AND NVL(m.VLEVENTO,0) = 0 THEN 'Criada'
                WHEN m.FLAPROVADA = 'N' AND NVL(m.VLEVENTO,0) <> 0 THEN 'Iniciada'
                WHEN m.FLAPROVADA = 'S' AND NVL(a.QT_FALTAM,0) > 0 THEN 'Assinatura pendente'
                WHEN m.FLAPROVADA = 'S' AND NVL(a.QT_FALTAM,0) = 0 THEN 'Finalizada'
                ELSE 'Indefinido'
            END
        ) <> 'Finalizada'
        THEN 'No prazo'
        ELSE 'Finalizada'
    END AS "Status competencia",
    emp.EMPRESAS AS "Empresa",
    os.SGORGAOSETOR AS "Diretoria",
    na.QT_NOTAS AS "Qtd Notas",
    na.NOTAS_FISCAIS AS "Notas Fiscais",
    na.VLNOTAS AS "Valor Notas",
    na.VLFATURADO AS "Valor Faturado",
    na.DTPRIMEIRANOTA AS "Data Primeira Nota",
    lq.QT_LIQUIDACOES AS "Qtd Liquidacoes",
    lq.VLLIQUIDADO AS "Valor Liquidado",
    lq.DTULTIMALIQ AS "Data Ultima Liquidacao",
    pg.QT_PAGAMENTOS AS "Qtd Pagamentos",
    pg.VLPAGO AS "Valor Pago",
    pg.DTULTIMOPGTO AS "Data Ultimo Pagamento",
    CASE
        WHEN NVL(na.QT_NOTAS,0) = 0     THEN 'Sem nota emitida'
        WHEN NVL(lq.VLLIQUIDADO,0) = 0  THEN 'Nota emitida - aguardando liquidacao'
        WHEN NVL(pg.VLPAGO,0) = 0       THEN 'Liquidada - aguardando pagamento'
        WHEN pg.VLPAGO >= NVL(m.VLEVENTO,0) AND NVL(m.VLEVENTO,0) > 0 THEN 'Paga integralmente'
        ELSE 'Paga parcialmente'
    END AS "Status Pagamento",
    CASE
        WHEN m.FLAPROVADA = 'N' AND NVL(m.VLEVENTO,0) = 0 THEN 'Criada'
        WHEN m.FLAPROVADA = 'N' AND NVL(m.VLEVENTO,0) <> 0 THEN 'Iniciada'
        WHEN m.FLAPROVADA = 'S' AND NVL(a.QT_FALTAM,0) > 0 THEN 'Assinatura pendente'
        WHEN m.FLAPROVADA = 'S' AND NVL(a.QT_FALTAM,0) = 0 AND NVL(na.QT_NOTAS,0) = 0 THEN 'Finalizada - aguardando nota'
        WHEN NVL(na.QT_NOTAS,0) > 0 AND NVL(lq.VLLIQUIDADO,0) = 0 THEN 'Nota emitida'
        WHEN NVL(lq.VLLIQUIDADO,0) > 0 AND NVL(pg.VLPAGO,0) = 0 THEN 'Liquidada'
        WHEN NVL(pg.VLPAGO,0) > 0 AND pg.VLPAGO < NVL(m.VLEVENTO,0) THEN 'Paga parcialmente'
        WHEN NVL(pg.VLPAGO,0) >= NVL(m.VLEVENTO,0) AND NVL(m.VLEVENTO,0) > 0 THEN 'Paga integralmente'
        ELSE 'Indefinido'
    END AS "Etapa Atual da Jornada"
FROM MEDICAO m
LEFT JOIN ECTOTITULO t ON t.NUTITULO = m.NUTITULO
LEFT JOIN ASSINATURA a ON a.NUTITULO = m.NUTITULO AND a.NUSEQMEDICAOH = m.NUSEQMEDICAOH
LEFT JOIN SEI s ON s.nutitulo = m.NUTITULO AND s.nuseqmedicaoh = m.NUSEQMEDICAOH
LEFT JOIN RODOVIAS r ON r.NUTITULO = m.NUTITULO
LEFT JOIN NATUREZA nz ON nz.NUTITULO = m.NUTITULO
LEFT JOIN EMPRESAS emp ON emp.NUTITULO = m.NUTITULO
LEFT JOIN ECPAORGAOSETOR os ON os.CDORGAOSETOR = t.CDSETOR
LEFT JOIN NOTAS_AGG na ON na.NUTITULO = m.NUTITULO AND na.NUSEQMEDICAOH = m.NUSEQMEDICAOH
LEFT JOIN LIQUIDACAO_AGG lq ON lq.NUTITULO = m.NUTITULO AND lq.NUSEQMEDICAOH = m.NUSEQMEDICAOH
LEFT JOIN PAGAMENTO_AGG pg ON pg.NUTITULO = m.NUTITULO AND pg.NUSEQMEDICAOH = m.NUSEQMEDICAOH
WHERE m.DTCRIACAO >= DATE '2026-06-01'
AND t.CDTITULO NOT LIKE '%COPIA'
AND t.CDTITULO NOT LIKE '%TESTE'
AND (
    nz.NATUREZAS = 'Obra Rodoviaria'
    OR (
        nz.NATUREZAS <> 'Obra Rodoviaria'
        AND UPPER(t.DEOBJETORESUMIDO) LIKE '%SUPERVISAO%'
    )
)
AND NOT (t.CDTITULO = '0023/2025' AND m.NUSEQMEDICAOH IN (1,2,3,4))
AND NOT (t.CDTITULO = '0067/2025' AND m.NUSEQMEDICAOH IN (4))
ORDER BY 1, 2
"""
