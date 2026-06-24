import { defineConfig } from "vite";
import { getHttpsServerOptions } from "office-addin-dev-certs";
import react from "@vitejs/plugin-react";

const contractCoreEntry = new URL("../../packages/contract-core/src/index.ts", import.meta.url).pathname;

export default defineConfig(async ({ command }) => {
  const httpsOptions = command === "serve" ? await getHttpsServerOptions() : undefined;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@contractr/contract-core": contractCoreEntry,
      },
    },
    server: {
      host: "localhost",
      port: 3000,
      strictPort: true,
      https: httpsOptions,
    },
  };
});
