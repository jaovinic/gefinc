-- A categoria padrão "Compras" deixa de ser lilás (#A855F7, parecida com Moradia, #8B5CF6) e passa
-- ao verde #16A34A, mais próximo da cor do sistema. Só muda quem ainda tem a cor padrão antiga.
-- Limitação: quem escolheu manualmente exatamente #A855F7 para "Compras" é indistinguível do padrão
-- e também passa ao verde; qualquer outra cor personalizada é preservada.
UPDATE categories
SET color_hex = '#16A34A'
WHERE type = 'EXPENSE'
  AND lower(name) = 'compras'
  AND upper(color_hex) = '#A855F7';
