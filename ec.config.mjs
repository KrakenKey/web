// Expressive Code renders every Markdown code block on the site (Starlight
// brings it in, and starlight-openapi keeps it on). One dark theme, the same
// one the blog used with Shiki, so code never switches to a light theme.
import { defineEcConfig } from '@astrojs/starlight/expressive-code';

export default defineEcConfig({
  themes: ['one-dark-pro'],
  useStarlightDarkModeSwitch: false,
  useStarlightUiThemeColors: false,
});
