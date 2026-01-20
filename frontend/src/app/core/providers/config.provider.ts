import { ValueProvider } from '@angular/core';

import { SERVER_CONFIG } from '../tokens/server-config.token';

export function provideServerConfig(config: any): ValueProvider {
  return { provide: SERVER_CONFIG, useValue: config };
}
