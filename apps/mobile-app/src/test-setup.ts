import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';

setupZonelessTestEnv({
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true
});

// jsdom não traz WebCrypto nem TextEncoder: usa os do Node (o app roda no WebView, que tem os dois).
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
Object.assign(globalThis, { TextEncoder, TextDecoder });
