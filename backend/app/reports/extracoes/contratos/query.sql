-- Cole aqui a query de extração de contratos (WITH RECURSIVE rodovias AS ...)
WITH RECURSIVE
rodovias AS (
    SELECT
        t.skcontrato,
        STRING_AGG(DISTINCT r.sgrodovia, ', ' ORDER BY r.sgrodovia) AS rodovias
    FROM siderdwh.ebisftrechorodoviaobracontrato t
    JOIN siderdwh.ebisdrodovia r ON r.skrodovia = t.skrodovia
    WHERE t.flactive = 'S'
    GROUP BY t.skcontrato
),

extensao AS (
    SELECT
        t.skcontrato,
        SUM(t.vlkmfim - t.vlkminicio) AS extensao_km
    FROM siderdwh.ebisftrechorodoviaobracontrato t
    WHERE t.flactive = 'S'
    GROUP BY t.skcontrato
),

empresas AS (
    SELECT
        sc.skcontrato,
        STRING_AGG(DISTINCT COALESCE(su.nmfantasia, su.nmsujeito), '; '
                   ORDER BY COALESCE(su.nmfantasia, su.nmsujeito)) AS contratadas
    FROM siderdwh.ebisfsujeitocontrato sc
    JOIN siderdwh.ebisdsujeito su ON su.sksujeito = sc.sksujeito
    GROUP BY sc.skcontrato
),

consorcio AS (   -- NOVO: flag do sujeito principal do contrato
    SELECT
        sc.skcontrato,
        MAX(CASE WHEN sc.flsujeitoprincipal = 'S' THEN su.flconsorcio END) AS flconsorcio
    FROM siderdwh.ebisfsujeitocontrato sc
    JOIN siderdwh.ebisdsujeito su ON su.sksujeito = sc.sksujeito
    GROUP BY sc.skcontrato
),

tipo_contrato AS (
    SELECT
        ac.skcontrato,
        ai.deagregadoritem
    FROM siderdwh.ebisfagregadorcontrato ac
    LEFT JOIN siderdwh.ebisdagregadoritemcontrato ai ON ai.skagregadoritem = ac.skagregadoritem
    WHERE ai.cdagregador = 1
),

natureza AS (
    SELECT
        fc.skcontrato,
        nat.denaturezacontrato
    FROM siderdwh.ebisfcontrato fc
    LEFT JOIN siderdwh.ebisdnaturezacontrato nat ON nat.sknaturezacontrato = fc.sknaturezacontrato
),

situacao_contrato AS (
    SELECT
        c.skcontrato,
        s.desituacao
    FROM siderdwh.ebisfcontrato c
    LEFT JOIN siderdwh.ebisdsituacaocontrato s ON s.sksituacao = c.sksituacao
),

empenho AS (
    SELECT
        fe.skcontrato,
        STRING_AGG(DISTINCT de.nuempenho::text, ', ' ORDER BY de.nuempenho::text) AS numeros_empenho
    FROM siderdwh.ebisfaofempenho fe
    LEFT JOIN siderdwh.ebisdaofempenho de ON de.skempenho = fe.skempenho
    GROUP BY fe.skcontrato
),

subacao AS (   -- NOVO — usei MIN pra bater com a query original; confirmar se MAX era intencional
    SELECT
        e.skcontrato,
        MIN(d.cdsubtitulo) AS subacao
    FROM siderdwh.ebisfaofempenho e
    LEFT JOIN siderdwh.ebisdaofdotacao d ON d.skdotacao = e.skdotacao
    GROUP BY e.skcontrato
),

valor_servico_contratado AS (
    -- agora também traz cdservicocontrato/cdservicocontratopai, pra montar a árvore de exclusão
    SELECT
        s.skcontrato,
        s.skservicocontrato,
        ds.deservicocontrato,
        ds.cdservicocontrato,
        ds.cdservicocontratopai,
        s.vlservicocontrato
    FROM siderdwh.ebisfcontratoservicoaditivo s
    LEFT JOIN siderdwh.ebisdcontratoservico ds ON ds.skservicocontrato = s.skservicocontrato
),

valor_servico_executado AS (
    SELECT
        ms.skcontrato,
        ms.skservicocontrato,
        ms.vlexecutado
    FROM siderdwh.ebisfmedicaoobraservexecgrupo ms
),

grupos_excluidos AS (
    -- raiz da árvore (sem pai) cujo nome bate com ADM/CANTEIRO/etc. — proxy de CDNIVELSERVICO=1
    SELECT DISTINCT skcontrato, cdservicocontrato
    FROM valor_servico_contratado
    WHERE cdservicocontratopai IS NULL
      AND (
             UPPER(deservicocontrato) LIKE '%ADM%'
          OR UPPER(deservicocontrato) LIKE '%CANTEIRO%'
          OR UPPER(deservicocontrato) LIKE '%PRELIM%'
          OR UPPER(deservicocontrato) LIKE '%DESPESAS%'
          OR UPPER(deservicocontrato) LIKE '%ENCARGOS%'
          OR UPPER(deservicocontrato) LIKE '%EQUIPE%'
          OR UPPER(deservicocontrato) LIKE '%MOBILIZA%'
      )
),

arvore_excluida AS (
    SELECT skcontrato, cdservicocontrato FROM grupos_excluidos
    UNION ALL
    SELECT f.skcontrato, f.cdservicocontrato
    FROM valor_servico_contratado f
    JOIN arvore_excluida a
        ON f.skcontrato = a.skcontrato AND f.cdservicocontratopai = a.cdservicocontrato
),

avanco_fisico AS (
    SELECT
        vc.skcontrato,
        SUM(vc.vlservicocontrato) AS valor_total_itens_af,
        SUM(COALESCE(ve.vlexecutado, 0)) AS valor_executado_af
    FROM valor_servico_contratado vc
    LEFT JOIN valor_servico_executado ve
        ON ve.skcontrato = vc.skcontrato AND ve.skservicocontrato = vc.skservicocontrato
    WHERE NOT EXISTS (
        SELECT 1 FROM arvore_excluida ae
        WHERE ae.skcontrato = vc.skcontrato AND ae.cdservicocontrato = vc.cdservicocontrato
    )
    GROUP BY vc.skcontrato
),

contrato AS (
    SELECT
        c.skcontrato,
        dc.cdtitulo,
        dc.deobjeto,
        dc.deobjetoresumido,
        dc.nuprocessoinf,
        c.vlcontrato,
        c.vltotalcontrato,
        c.qtdiasiniciofimcontratoinicial,
        c.qtdiasiniciofimcontratoaditivo - c.qtdiasiniciofimcontratoinicial   AS qtdiasvigenciaaditivo,
        c.qtdiasiniciofimexecucaoinicial,
        c.qtdiasiniciofimexecucaoaditivo - c.qtdiasiniciofimexecucaoinicial   AS qtdiasexecucaoaditivo,
        c.sktempofimaditivo,
        c.sktempofimexecucaoaditivo,
        c.sktempotitulo,
        c.sktempoinicioexecucao,
        s.nmorgaosetor
    FROM siderdwh.ebisfcontrato c
    LEFT JOIN siderdwh.ebisdcontrato dc  ON dc.skcontrato = c.skcontrato
    LEFT JOIN siderdwh.ebisdorgaosetor s ON s.skorgaosetor = c.sksetor
)

SELECT
    ct.cdtitulo                                                     AS "Nº do Contrato",
    rd.rodovias                                                     AS "Rodovias",
    ct.deobjetoresumido                                             AS "Objeto",
    ex.extensao_km                                                  AS "Extensão Km",
    sit.desituacao                                                  AS "Situação do Contrato",
    ct.vlcontrato                                                   AS "Valor da PO (R$)",
    ct.vltotalcontrato                                              AS "Valor Atual (R$)",
    ct.qtdiasiniciofimcontratoinicial                               AS "Prazo de Vigência Inicial",
    ct.qtdiasvigenciaaditivo                                        AS "Prazo de Vigência Aditado",
    ct.qtdiasiniciofimexecucaoinicial                               AS "Prazo de Execução Inicial",
    ct.qtdiasexecucaoaditivo                                        AS "Prazo de Execução Aditado",
    TO_CHAR(tv.dttempo, 'DD/MM/YYYY')                               AS "Data de Término Aditada da Vigência",
    TO_CHAR(te.dttempo, 'DD/MM/YYYY')                               AS "Data de Término Aditada da Execução",
    tc.deagregadoritem                                              AS "Tipo de Contrato",
    ct.nmorgaosetor                                                 AS "Distrito Rodoviário",
    emp.contratadas                                                 AS "Contratada",
    CASE WHEN cons.flconsorcio = 'S' THEN 'Y' WHEN cons.flconsorcio = 'N' THEN 'N' END AS "Consórcio",
    ct.nuprocessoinf                                                AS "Número do Processo",   -- confirmar mapeamento
    emps.numeros_empenho                                            AS "Número do Empenho",
    sub.subacao                                                     AS "Subação",
    CASE
        WHEN UPPER(tc.deagregadoritem ) = 'OBRA RODOVIÁRIA' THEN
            ROUND(
                CASE WHEN COALESCE(af.valor_total_itens_af, 0) = 0 THEN 0
                     ELSE (af.valor_executado_af / af.valor_total_itens_af) * 100
                END, 2)
    END                                                              AS "Avanço Físico (%)",
    ct.nmorgaosetor                                                 AS "Setor Administrativo Responsável",
    TO_CHAR(ti.dttempo, 'DD/MM/YYYY')                               AS "Data de Início da Execução",
    TO_CHAR(ta.dttempo, 'DD/MM/YYYY')                               AS "Data da Assinatura"
FROM contrato ct
LEFT JOIN rodovias rd            ON rd.skcontrato = ct.skcontrato
LEFT JOIN extensao ex            ON ex.skcontrato = ct.skcontrato
LEFT JOIN situacao_contrato sit  ON sit.skcontrato = ct.skcontrato
LEFT JOIN natureza nat           ON nat.skcontrato = ct.skcontrato
LEFT JOIN tipo_contrato tc       ON tc.skcontrato = ct.skcontrato
LEFT JOIN empresas emp           ON emp.skcontrato = ct.skcontrato
LEFT JOIN consorcio cons         ON cons.skcontrato = ct.skcontrato
LEFT JOIN empenho emps           ON emps.skcontrato = ct.skcontrato
LEFT JOIN subacao sub            ON sub.skcontrato = ct.skcontrato
LEFT JOIN avanco_fisico af       ON af.skcontrato = ct.skcontrato
LEFT JOIN siderdwh.ebisdtempo tv ON tv.sktempo = NULLIF(ct.sktempofimaditivo, 0)
LEFT JOIN siderdwh.ebisdtempo te ON te.sktempo = NULLIF(ct.sktempofimexecucaoaditivo, 0)
LEFT JOIN siderdwh.ebisdtempo ta ON ta.sktempo = NULLIF(ct.sktempotitulo, 0)
LEFT JOIN siderdwh.ebisdtempo ti ON ti.sktempo = NULLIF(ct.sktempoinicioexecucao, 0)
ORDER BY ct.cdtitulo;