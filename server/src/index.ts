import { createApp } from "./app.js";
import { startAlertEngine } from "./modules/alerts/engine.js";

const port = Number(process.env.PORT ?? 3333);

createApp().listen(port, () => {
  console.log(`🔥 API do F.O.G.O. rodando em http://localhost:${port}`);
  startAlertEngine();
});
