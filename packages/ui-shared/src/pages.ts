/**
 * Telas carregadas sob demanda (`loadComponent`). Ficam fora do barrel principal para que o
 * empacotador as separe em chunks próprios em vez de mantê-las no pacote inicial.
 */
export * from './lib/accounts/accounts-page';
export * from './lib/categories/categories-page';
export * from './lib/transactions/transactions-page';
export * from './lib/invoices/invoices-page';
export * from './lib/invoices/cashflow-page';
export * from './lib/transfers/transfers-page';
