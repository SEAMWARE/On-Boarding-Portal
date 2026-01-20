import { InjectionToken } from '@angular/core';

export const SERVER_CONFIG = new InjectionToken<Record<string, any>>('common:server_config', {
  factory: () => {
    return {};
  },
  providedIn: 'root',
});
