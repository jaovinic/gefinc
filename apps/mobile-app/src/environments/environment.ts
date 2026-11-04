/**
 * Desenvolvimento (`serve` e `build --configuration=development`). O build de produção troca este arquivo
 * por `environment.prod.ts` (fileReplacements). No emulador ou aparelho, use `adb reverse tcp:8080 tcp:8080`:
 * o debug só libera HTTP para `localhost` (o `10.0.2.2` seria bloqueado).
 */
export const environment = {
  apiUrl: 'http://localhost:8080/api/v1',
};
