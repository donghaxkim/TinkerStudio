import { readConfig } from "./config.js";
import { buildServer } from "./server.js";

const config = readConfig();
const server = await buildServer({ config });

await server.listen({ host: config.host, port: config.port });
console.info(`Tinker API listening at http://${config.host}:${config.port}`);
