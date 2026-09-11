import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { portalApi } from "../../services/api";

export default function ReportPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: meta } = useQuery({
    queryKey: ["report-meta", slug],
    queryFn: () => portalApi.getReport(slug!).then((r) => r.data),
    enabled: !!slug,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["report-data", slug],
    queryFn: () => portalApi.getReportData(slug!).then((r) => r.data),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-gov-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-8 text-center text-red-600">
        Erro ao carregar o relatório.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">{meta?.title}</h1>
        {meta?.description && (
          <p className="text-sm text-gray-500 mt-1">{meta.description}</p>
        )}
      </div>

      {/* Tabela de dados */}
      {data && data.length > 0 ? (
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
                      <td key={j} className="px-4 py-3 text-gray-800 whitespace-nowrap">
                        {val === null || val === undefined ? "—" : String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            {data.length} registro(s)
          </div>
        </div>
      ) : (
        <div className="card p-10 text-center text-gray-400">Sem dados para exibir.</div>
      )}
    </div>
  );
}
