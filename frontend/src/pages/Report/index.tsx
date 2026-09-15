import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clock, Database } from "lucide-react";
import { portalApi, parseUTC } from "../../services/api";
import { resolvePanelBySlug } from "../../panels/registry";

function CellValue({ value }: { value: unknown }) {
  return <span>{value === null || value === undefined ? "" : String(value)}</span>;
}

export default function ReportPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: meta } = useQuery({
    queryKey: ["report-meta", slug],
    queryFn: () => portalApi.getReport(slug!).then((r) => r.data),
    enabled: !!slug,
  });

  // panel_slug é o nome da pasta (imutável); slug é o de URL (editável pelo admin)
  const Panel = resolvePanelBySlug(meta?.panel_slug ?? slug);

  const { data, isLoading, error } = useQuery({
    queryKey: ["report-data", slug],
    queryFn: () => portalApi.getReportData(slug!).then((r) => r.data),
    enabled: !!slug,
    staleTime: Infinity,
  });

  return (
    <div className="px-4 lg:px-8 py-5">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 leading-tight">
          {meta?.title ?? "Carregando..."}
        </h1>
        {meta?.last_refreshed_at && (
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <Clock size={11} />
            Atualizado em{" "}
            {parseUTC(meta.last_refreshed_at)?.toLocaleString("pt-BR")}
          </p>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-64 gap-3 text-gray-400">
          <div className="w-6 h-6 border-2 border-gov-blue border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Carregando dados...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-8 text-center">
          <Database size={36} className="mx-auto text-amber-400 mb-3" />
          <p className="text-gray-700 font-medium">Dados não disponíveis</p>
          <p className="text-sm text-gray-500 mt-1">
            Este relatório ainda não teve seus dados importados. Aguarde um publicador atualizar.
          </p>
        </div>
      )}

      {/* Panel */}
      {!isLoading && !error && data && data.length > 0 && (
        Panel ? (
          <Panel data={data} />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {Object.keys(data[0]).map((col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="px-4 py-2.5 text-gray-800 whitespace-nowrap">
                          <CellValue value={val} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {!isLoading && !error && data?.length === 0 && (
        <div className="card p-10 text-center text-gray-400">Sem dados para exibir.</div>
      )}
    </div>
  );
}
