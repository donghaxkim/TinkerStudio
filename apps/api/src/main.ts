import { readConfig } from "./config.js";
import { buildServer } from "./server.js";
import { createComposeRunEdit } from "./edit/composeRunEdit.js";
import { createDefaultRunAgent } from "./edit/runAgent.js";

const config = readConfig();
const runEdit = createComposeRunEdit({ runAgent: createDefaultRunAgent() });
const server = await buildServer({ config, runEdit });

await server.listen({ host: config.host, port: config.port });
console.info(`Tinker API listening at http://${config.host}:${config.port}`);
