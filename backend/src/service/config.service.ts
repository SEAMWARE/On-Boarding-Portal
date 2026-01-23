import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { AppConfig } from '../type/app-config';

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
      const value = source[key];

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.deepMerge(target[key] ?? {}, value);
      } else {
        result[key] = this._resolveValue(value);
      }
    }

    return result;
  }

private _resolveValue(value: any): any {
    if (typeof value === 'string') {
      const regex = /\${(\w+)}/g;
      return value.replace(regex, (_, envVarName) => {
        return process.env[envVarName] ?? `\${${envVarName}}`;
      });
    }

    if (Array.isArray(value)) {
      return value.map(item => this._resolveValue(item));
    }

    return value;
  }
}

export const configService = new ConfigService();