import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BarChart3, Clock, AlertCircle } from "lucide-react";
import { portalApi, ReportCard, resolveImageUrl } from "../../services/api";
import { resolveThumbnailBySlug } from "../../panels/registry";

function ReportCardItem({ report }: { report: ReportCard }) {
  const navigate = useNavigate();
  const Thumbnail = resolveThumbnailBySlug(report.slug);
  const hasData = !!report.last_refreshed_at;

  return (
    <div
      className="card p-0 overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group"
      onClick={() => navigate(`/relatorio/${report.slug}`)}
    >
      {/* Thumbnail */}
      <div className="relative h-36 bg-gray-100 overflow-hidden border-b border-gray-100">
        {report.cover_image_url ? (
          <img src={resolveImageUrl(report.cover_image_url, true)} alt={report.title} className="w-full h-full object-cover" />
        ) : Thumbnail ? (
          <Thumbnail />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BarChart3 size={36} className="text-gray-200" />
          </div>
        )}
        {!hasData && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
              Aguardando dados
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-gov-blue transition-colors leading-snug">
          {report.title}
        </h3>

        {report.description && (
          <p className="text-sm text-gray-500 line-clamp-2 mb-3">{report.description}</p>
        )}

        <div className="flex items-center gap-1.5 text-xs">
          {hasData ? (
            <>
              <Clock size={11} className="text-green-500 flex-shrink-0" />
              <span className="text-gray-400">
                Atualizado em {new Date(report.last_refreshed_at!).toLocaleDateString("pt-BR")}
              </span>
            </>
          ) : (
            <>
              <AlertCircle size={11} className="text-amber-500 flex-shrink-0" />
              <span className="text-amber-600">Aguardando importação</span>
            </>
          )}
        </div>
      </div>
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
