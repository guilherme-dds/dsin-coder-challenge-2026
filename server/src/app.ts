import express from "express";
import cors from "cors";
import { errorHandler } from "./lib/http-error.js";
import { equipmentTypesRouter } from "./modules/equipment-types/routes.js";
import { equipmentsRouter } from "./modules/equipments/routes.js";
import { agentsRouter } from "./modules/agents/routes.js";
import { dashboardRouter } from "./modules/dashboard/routes.js";
import { cepRouter } from "./modules/cep/routes.js";
import { metricsRouter } from "./modules/metrics/routes.js";
import { mapRouter } from "./modules/map/routes.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/equipment-types", equipmentTypesRouter);
  app.use("/api/equipments", equipmentsRouter);
  app.use("/api/agents", agentsRouter);
  app.use("/api/map", mapRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/cep", cepRouter);
  app.use("/metrics", metricsRouter);

  app.use(errorHandler);
  return app;
}
