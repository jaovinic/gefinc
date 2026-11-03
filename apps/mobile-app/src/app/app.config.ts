import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localePt from '@angular/common/locales/pt';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideIonicAngular } from '@ionic/angular';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { APP_PATHS, THEME_CHROME, authInterceptor, provideGlass, provideTheme } from '@gefinc/ui-shared';
import { appRoutes } from './app.routes';
import { provideBackNavigation } from './navigation/back-navigation';
import { systemBarsChrome } from './native/native-ports';
import { provideLock } from './lock/lock.providers';
import { offlineInterceptor } from './offline/offline.interceptor';
import { provideOffline } from './offline/offline.providers';
import { provideReminders } from './reminders/reminders.providers';
import { provideSession } from './core/session.providers';

registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideIonicAngular({ mode: 'ios' }),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, offlineInterceptor])),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    { provide: APP_PATHS, useValue: { transactions: '/lancamentos', accounts: '/contas' } },
    provideSession(),
    { provide: THEME_CHROME, useFactory: systemBarsChrome },
    provideTheme(),
    provideGlass(),
    provideOffline(),
    provideLock(),
    provideBackNavigation(),
    provideReminders(),
  ],
};
