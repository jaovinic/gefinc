import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { getReadyUrl, workspaceRoot } from '@nx/devkit';

const isCI = !!process.env['CI'];
// For CI, you may want to set BASE_URL to the deployed application.
// getReadyUrl moves the address to the port the dev server task reported.
const baseURL = process.env['BASE_URL'] || getReadyUrl('http://localhost:4200');

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import 'dotenv/config';

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader (dynamic import,
 * bypassing the pirates CJS-compile path), and Nx's native TS strip loads
 * `.mts` directly. Playwright's configLoader auto-discovers
 * `playwright.config.mts` via its extension list
 * (.ts/.js/.mts/.mjs/.cts/.cjs).
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    // A suíte assume o tema escuro (padrão do app sem preferência); os testes do tema claro mudam por teste.
    colorScheme: 'dark',
  },
  webServer: [
    {
      // Banco e Mailpit (docker compose) e a API em modo local.
      // `exec` + fork=false: o Maven passa a ser o próprio processo da API; ao encerrar o servidor
      // a porta é liberada (sem processo Java órfão).
      command:
        'docker compose up -d --wait && cd apps/api-server && exec ./mvnw -B spring-boot:run '
        + '-Dspring-boot.run.fork=false -Dspring-boot.run.profiles=local',
      url: 'http://localhost:8080/api/v1/actuator/health',
      reuseExistingServer: true,
      timeout: 240_000,
      cwd: workspaceRoot,
    },
    {
      command: isCI ? 'npx nx run web-app:serve-static' : 'npx nx run web-app:serve',
      url: getReadyUrl('http://localhost:4200'),
      reuseExistingServer: true,
      cwd: workspaceRoot,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
