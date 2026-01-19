// config.ts
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { AppConfig } from '../types/app-config';

class ConfigService {
  defaultConfigFiles = ['application.default.yaml', 'config/application.default.yaml'];
  config: AppConfig;

  constructor() {
    const entryFileDir = `${path.dirname(require.main?.filename || __dirname)}`;
    const defaultConfig = this._loadDefault(entryFileDir);
    const providedConfig = this._loadYaml(path.resolve(entryFileDir, `config/application.yaml`));
    this.config = this.deepMerge(defaultConfig, providedConfig) as AppConfig;
  }

  get(): AppConfig {
    return this.config;
  }

  private _loadDefault(entryFileDir: string): Record<string, any> {
    const defaultFile = this.defaultConfigFiles.find((file) => fs.existsSync(path.resolve(entryFileDir, file)))
    return defaultFile ? this._loadYaml(path.resolve(entryFileDir, defaultFile)) : {};
  }

  private _loadYaml(filePath: string): Record<string, any> {

    if (!fs.existsSync(filePath)) {
      return {};
    }

    const contents = fs.readFileSync(filePath, 'utf8');
    return yaml.load(contents) as Record<string, any>;
  }

  private deepMerge(
    target: Record<string, any>,
    source: Record<string, any>
  ): Record<string, any> {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        result[key] = this.deepMerge(target[key] ?? {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }
}

export const configService = new ConfigService();