import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// `npm run test:browser`: the paths that only a real browser exercises (WebGL, canvas text, FontFace, decodeAudioData,
// layout), run in headless Chromium. Kept apart from `npm test`, which stays node-only and fast.
export default defineConfig({
  // found up front, so Vite never reloads the page under a running test when it first meets them
  optimizeDeps: { include: ['pixi.js', 'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] },
  test: {
    include: ['test/browser/**/*.test.{ts,tsx}'],
    browser: {
      enabled: true,
      headless: true,
      // WebGL through SwiftShader on every machine: a CI runner has no GPU (and Chromium no longer falls back to
      // software WebGL on its own), and one renderer everywhere keeps pixel reads from differing by driver
      provider: playwright({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } }),
      instances: [{ browser: 'chromium' }],
      // a fixed window, so layout assertions (a panel fitted to the viewport) do not depend on the machine
      viewport: { width: 800, height: 600 },
      screenshotFailures: false,
    },
  },
});
