import { useCallback, useEffect, useState } from "react";

/** Carrega dados assíncronos e expõe `reload` para atualizar após mutações. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(load, deps);

  const reload = useCallback(() => {
    setLoading(true);
    run()
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [run]);

  useEffect(reload, [reload]);

  return { data, error, loading, reload };
}
