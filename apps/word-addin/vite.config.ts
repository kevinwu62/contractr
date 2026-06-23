import { defineConfig } from "vite";
import { getHttpsServerOptions } from "office-addin-dev-certs";
import react from "@vitejs/plugin-react";

export default defineConfig(async ({ command }) => {
  const httpsOptions = command === "serve" ? await getHttpsServerOptions() : undefined;

  return {
    plugins: [react()],
    server: {
      host: "localhost",
      port: 3000,
      strictPort: true,
      https: httpsOptions,
    },
  };
});
