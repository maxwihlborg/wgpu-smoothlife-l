import { defineConfig } from "vite";
import { basename } from "node:path";

export default defineConfig({
  base: process.env.GITHUB_REPOSITORY
    ? `/${basename(process.env.GITHUB_REPOSITORY)}/`
    : "/",
});
