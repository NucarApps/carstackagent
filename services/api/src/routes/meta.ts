import type { FastifyInstance } from "fastify";
import { refRepo } from "@dip/core";
import type { RouteDeps } from "../server.js";

/** GET /meta/{roles,locations} — drive the web RoleSwitcher from ref.*. */
export function metaRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get("/meta/roles", async () => ({ roles: await refRepo.getRoles(deps.sql) }));
  app.get("/meta/locations", async () => ({
    locations: await refRepo.getLocationMeta(deps.sql),
  }));
}
