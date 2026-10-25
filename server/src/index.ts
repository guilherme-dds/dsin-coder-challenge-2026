import { createApp } from "./app.js";
import { startAlertEngine } from "./modules/alerts/engine.js";
import { startRetentionJob } from "./modules/telemetry/retention.js";
import { startSnapshotJob } from "./modules/regions/snapshots.js";

const port = Number(process.env.PORT ?? 3333);

createApp().listen(port, () => {
  console.log(`🔥 API do F.O.G.O. rodando em http://localhost:${port}`);
  startRetentionJob();
  // O histórico registra quantos alertas estão abertos: só começa depois da primeira avaliação.
  startAlertEngine()
    .then(startSnapshotJob)
    .catch((err) => console.error("Falha ao iniciar o histórico de disponibilidade:", err));
});
