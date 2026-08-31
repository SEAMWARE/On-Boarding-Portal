export interface Config {
  serverHost: string;
  documentToSignUrl: string;
  didCreationEnabled: boolean;
  theme: ThemeConfig;
}

export interface ThemeConfig {
  name: string;
  appName?: string;
  logoUrl?: string;
  faviconUrl?: string;
}

export const DEFAULT_THEME: ThemeConfig = {
  name: 'default',
  appName: 'On Boarding Portal',
};
