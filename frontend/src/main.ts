import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { installDropdownGuard, installTooltips } from './app/shared/tooltip-host';

installTooltips();
installDropdownGuard();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
