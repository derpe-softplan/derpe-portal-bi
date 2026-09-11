import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BarChart3, ChevronRight, Clock } from "lucide-react";
import { portalApi, ReportCard } from "../../services/api";

function ReportCardItem({ report }: { report: ReportCard }) {
  const navigate = useNavigate();
  const date = report.published_at
    ? new Date(report.published_at).toLocaleDateString("pt-BR")
    : null;

  return (
    <div
      className="card p-5 hover:shadow-md transition-shadow cursor-pointer group"
      onClick={() => navigate(`/relatorio/${report.slug}`)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 bg-gov-blue-light rounded-lg flex items-center justify-center text-gov-blue">
          <BarChart3 size={20} />
        </div>
        <ChevronRight
          size={18}
          className="text-gray-300 group-hover:text-gov-blue transition-colors mt-1"
        />
      </div>

      <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-gov-blue transition-colors">
        {report.title}
      </h3>

      {report.description && (
        <p className="text-sm text-gray-500 line-clamp-2 mb-3">{report.description}</p>
      )}

      {date && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Clock size={12} />
          Publicado em {date}
        </div>
      )}
    </div>
  );
}

export default function Portal() {
  const { data: reports, isLoading, error } = useQuery({
    queryKey: ["portal-reports"],
    queryFn: () => portalApi.listReports().then((r) => r.data),
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
        Erro ao carregar relatórios. Tente novamente.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Relatórios disponíveis</h1>
        <p className="text-sm text-gray-500 mt-1">
          {reports?.length ?? 0} relatório(s) publicado(s) para o seu perfil
        </p>
      </div>

      {reports && reports.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {reports.map((r) => (
            <ReportCardItem key={r.id} report={r} />
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <BarChart3 size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Nenhum relatório disponível para o seu perfil.</p>
        </div>
      )}
    </div>
  );
}
