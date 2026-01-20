import { inject, Injectable } from '@angular/core';

import { SERVER_CONFIG } from '../tokens/server-config.token';
import { Config } from '../../../models/config';

@Injectable({
  providedIn: 'root',
})
export class ServerConfigService<T = Config> {
  private readonly _config = inject<T>(SERVER_CONFIG);

  getProperty<K extends keyof T>(name: K): T[K] {
    return this._config[name];
  }

  setProperty<K extends keyof T>(name: K, value: T[K]): void {
    this._config[name] = value;
  }
}
