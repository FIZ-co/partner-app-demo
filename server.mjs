import { createDemoServer } from "./app.mjs";
import { readConfig } from "./config.mjs";

try {
  const config = readConfig();
  const server = createDemoServer(config);
  await new Promise((resolve, reject) =>
    server.once("error", reject).listen(config.port, "127.0.0.1", resolve),
  );
  console.log(`${config.appName}: ${config.baseUrl}`);
  console.log(`FIZ connection: ${config.api}`);
  if (!config.configured)
    console.log(
      `Finish integration setup at ${config.baseUrl}/setup (missing ${config.missingCredentials.join(", ")}).`,
    );
  const stop = () => server.close();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (error) {
  console.error(`Cannot start app: ${error.message}`);
  process.exit(1);
}
