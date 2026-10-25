import { useCallback, useEffect, useRef, useState } from "react";

interface AsyncOptions {
  /** Recarrega sozinho neste intervalo (ms), para telas que acompanham a operação ao vivo. */
  refreshMs?: number;
}

/** Carrega dados assíncronos e expõe `reload` para atualizar após mutações. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = [], { refreshMs }: AsyncOptions = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // Só a resposta da chamada mais recente vale: uma lenta não sobrescreve dados mais novos.
  const latest = useRef(0);

  const run = useCallback(load, deps);

  const reload = useCallback(() => {
    const call = ++latest.current;
    setLoading(true);
    run()
      .then((result) => {
        if (call !== latest.current) return;
        setData(result);
        setError(null);
        setUpdatedAt(new Date());
      })
      .catch((err: Error) => call === latest.current && setError(err.message))
      .finally(() => call === latest.current && setLoading(false));
  }, [run]);

  useEffect(reload, [reload]);

  useEffect(() => {
    if (!refreshMs) return;
    // Com a aba escondida não há quem olhe: poupa a API.
    const timer = setInterval(() => document.visibilityState === "visible" && reload(), refreshMs);
    return () => clearInterval(timer);
  }, [reload, refreshMs]);

  return { data, error, loading, updatedAt, reload };
}

/** Força a re-renderização periodicamente, para textos relativos como "há 12 s". */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
