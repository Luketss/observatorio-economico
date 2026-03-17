import { useRouteError, isRouteErrorResponse, Link } from "react-router-dom";

export default function ErrorPage() {
  const error = useRouteError();

  let title = "Erro inesperado";
  let message = "Ocorreu um problema ao carregar a aplicação.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message = error.data || message;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center">
      <h1 className="text-3xl font-bold text-red-600 mb-4">{title}</h1>
      <p className="text-slate-600 dark:text-slate-300 mb-6">
        {message}
      </p>
      <Link
        to="/"
        className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition"
      >
        Voltar ao painel
      </Link>
    </div>
  );
}
