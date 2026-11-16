import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // The screens' logic (stores, rules, network); React glue is covered by the e2e tests.
      include: ["src/api/**/*.ts", "src/features/**/*.ts", "src/lib/**/*.ts"],
      exclude: ["**/*.test.ts", "src/features/**/use*.ts"],
      reporter: ["text-summary"],
      thresholds: { lines: 70, functions: 70, branches: 65, statements: 70 },
    },
  },
});
