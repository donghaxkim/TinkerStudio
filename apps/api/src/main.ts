import { readConfig } from "./config.js";
import { buildServer } from "./server.js";
import { createComposeRunEdit } from "./edit/composeRunEdit.js";
import { createDefaultRunAgent } from "./edit/runAgent.js";
import { createDefaultRunRender } from "./edit/renderRevision.js";

const config = readConfig();
const runEdit = createComposeRunEdit({ runAgent: createDefaultRunAgent() });
const server = await buildServer({ config, runEdit, runRender: createDefaultRunRender() });

await server.listen({ host: config.host, port: config.port });
console.info(`Tinker API listening at http://${config.host}:${config.port}`);
