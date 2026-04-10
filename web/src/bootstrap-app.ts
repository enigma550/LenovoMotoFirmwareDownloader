import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

export async function bootstrapLmfdApp() {
  await bootstrapApplication(App, appConfig);
}
