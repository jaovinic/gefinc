import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localePt from '@angular/common/locales/pt';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideIonicAngular } from '@ionic/angular';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { APP_PATHS, authInterceptor } from '@gefinc/ui-shared';
import { appRoutes } from './app.routes';
import { provideLock } from './lock/lock.providers';
import { offlineInterceptor } from './offline/offline.interceptor';
import { provideOffline } from './offline/offline.providers';
import { provideSession } from './core/session.providers';

registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideIonicAngular({ mode: 'ios' }),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, offlineInterceptor])),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    { provide: APP_PATHS, useValue: { transactions: '/lancamentos' } },
    provideSession(),
    provideOffline(),
    provideLock(),
  ],
};
