import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ServerConfigService } from './core/services/server-config';

const FAVICON_MIME_TYPES: Record<string, string> = {
  ico: 'image/x-icon',
  png: 'image/png',
  svg: 'image/svg+xml',
};

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('onboarding');

  constructor(config: ServerConfigService, titleService: Title) {
    // The favicon <link href> and <title> can't be set server-side via EJS:
    // `ng serve` (dev) doesn't process the template, and the browser
    // dereferences href as a real request (title doesn't, but would show the
    // raw "<%= ... %>" text), so both are applied here instead, once
    // Angular runs, using the same theme metadata the EJS render would use.
    const theme = config.getProperty('theme');

    if (theme?.faviconUrl) {
      const link = document.getElementById('app-favicon') as HTMLLinkElement | null;
      if (link) {
        link.href = theme.faviconUrl;
        link.type = FAVICON_MIME_TYPES[theme.faviconUrl.split('.').pop() ?? ''] ?? 'image/x-icon';
      }
    }

    if (theme?.appName) {
      titleService.setTitle(theme.appName);
    }
  }
}
