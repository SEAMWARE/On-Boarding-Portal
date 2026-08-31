import { Config, DEFAULT_THEME } from "../models/config";

export const environment: Config = {
  serverHost: 'http://localhost:8080',
  documentToSignUrl: '',
  didCreationEnabled: true,
  theme: DEFAULT_THEME
}
