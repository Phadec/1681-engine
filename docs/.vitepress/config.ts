import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';

// the API pages and their sidebar are written by TypeDoc (`npm run docs:prepare`) before the site builds
const sidebarFile = fileURLToPath(new URL('../api/typedoc-sidebar.json', import.meta.url));
const apiSidebar = existsSync(sidebarFile) ? JSON.parse(readFileSync(sidebarFile, 'utf8')) : [];

export default defineConfig({
  title: '1681 Engine',
  description: 'A 2D game engine for the web on PixiJS 8: scenes and a fast ECS, Tiled maps, input, rigs, light, music and multiplayer, with a pixel-art module.',
  // GitHub Pages serves a project site under its repository's name; set DOCS_BASE=/<repo>/ there
  base: process.env.DOCS_BASE ?? '/',
  cleanUrls: true,
  lastUpdated: true,
  // the examples are static pages copied into public/ by `npm run docs:examples`, not VitePress routes
  ignoreDeadLinks: [/^\/examples\//],
  head: [['meta', { name: 'theme-color', content: '#ffb060' }]],
  markdown: {
    // inline code is not compiled as a Vue template: the API pages quote `{{` and `}}` (formatMessage's escapes),
    // which Vue otherwise reads as an interpolation and fails the build on
    config(md) {
      const inline = md.renderer.rules.code_inline!;
      md.renderer.rules.code_inline = (tokens, idx, options, env, self) => inline(tokens, idx, options, env, self).replace(/^<code/, '<code v-pre');
    },
  },
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
        {
          text: 'Playing',
          items: [
            { text: 'Input', link: '/guide/input' },
            { text: 'Animation', link: '/guide/animation' },
            { text: 'Physics', link: '/guide/physics' },
            { text: 'Navigation', link: '/guide/navigation' },
          ],
        },
        {
          text: 'Looks',
          items: [
            { text: 'Particles', link: '/guide/particles' },
            { text: 'Game feel', link: '/guide/game-feel' },
            { text: 'Time of day, weather and colour', link: '/guide/ambient' },
            { text: 'Tweens and parallax', link: '/guide/tweens-and-parallax' },
            { text: 'Scene transitions', link: '/guide/transitions' },
          ],
        },
        {
          text: 'Interface',
          items: [
            { text: 'UI', link: '/guide/ui' },
            { text: 'React kit', link: '/guide/react' },
            { text: 'Localisation', link: '/guide/i18n' },
          ],
        },
        {
          text: 'Shipping',
          items: [
            { text: 'Saves', link: '/guide/saves' },
            { text: 'Diagnostics and debug', link: '/guide/diagnostics-and-debug' },
          ],
        },
      ],
      '/api/': [{ text: 'API reference', items: apiSidebar }],
    },
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/Phadec/1681-engine' }],
    editLink: { pattern: 'https://github.com/Phadec/1681-engine/edit/main/docs/:path', text: 'Edit this page on GitHub' },
    outline: { level: [2, 3] },
    footer: { message: 'Released under the MIT License.' },
  },
});
