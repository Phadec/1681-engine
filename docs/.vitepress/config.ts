import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';

// the API pages and their sidebar are written by TypeDoc (`npm run docs:prepare`) before the site builds
const sidebarFile = fileURLToPath(new URL('../api/typedoc-sidebar.json', import.meta.url));
const apiSidebar = existsSync(sidebarFile) ? JSON.parse(readFileSync(sidebarFile, 'utf8')) : [];

export default defineConfig({
  title: 'Lantern Engine',
  description: 'A 2D game engine for the web on PixiJS 8: scenes and a fast ECS, Tiled maps, input, rigs, light, music and multiplayer, with a pixel-art module.',
  // GitHub Pages serves a project site under its repository's name; set DOCS_BASE=/<repo>/ there
  base: process.env.DOCS_BASE ?? '/',
  cleanUrls: true,
  lastUpdated: true,
  // the examples are static pages copied into public/ by `npm run docs:examples`, not VitePress routes
  ignoreDeadLinks: [/^\/examples\//],
  head: [['meta', { name: 'theme-color', content: '#ffb060' }]],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Examples', link: '/examples' },
      { text: 'API', link: '/api/' },
      { text: 'Changelog', link: '/changelog' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Architecture', link: '/guide/architecture' },
          ],
        },
      ],
      '/api/': [{ text: 'API reference', items: apiSidebar }],
    },
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    footer: { message: 'Released under the MIT License.' },
  },
});
