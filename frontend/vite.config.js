import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Milestone 2: keep local dev aligned with the Compose-published frontend port.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
});
