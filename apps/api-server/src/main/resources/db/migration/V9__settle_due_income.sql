-- Receita com vencimento até hoje passa a entrar na conta automaticamente: as receitas pendentes e
-- já vencidas (fora de cartão) viram recebidas na data de vencimento. Receitas em cartão (legado)
-- e despesas ficam como estão.
UPDATE transactions t
SET status = 'PAID',
    payment_date = t.due_date,
    version = t.version + 1
FROM categories c, accounts a
WHERE t.category_id = c.id
  AND t.user_id = c.user_id
  AND t.account_id = a.id
  AND t.user_id = a.user_id
  AND c.type = 'INCOME'
  AND a.type <> 'CREDIT_CARD'
  AND t.status = 'PENDING'
  AND t.due_date <= (now() AT TIME ZONE 'America/Sao_Paulo')::date;
