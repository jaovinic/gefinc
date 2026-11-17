# Specification Quality Checklist: Painel administrativo

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-14
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] Nenhum marcador de clarificação pendente (resolvidos: exclusão pelo admin com prazo e motivo, retenção indefinida da auditoria com anonimização de e-mail e nome, sem 2FA nesta versão)
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Os 3 marcadores de clarificação foram resolvidos em 2026-11-14: (1) US10/FR-015/FR-036 a FR-038: o administrador pode antecipar a exclusão, com motivo, prazo imediato ou de 1 a 30 dias, reautenticação e aviso ao usuário com motivo genérico; (2) FR-022/FR-039: auditoria retida indefinidamente, anonimizando e-mail e nome na exclusão do usuário; (3) FR-035: sem 2FA nesta versão, só reautenticação por senha (2FA como evolução futura).
- Rodada 2 (2026-11-14), decisões do usuário incorporadas à spec:
  1. Teto de prazo confirmado em 30 dias; só igualar ou encurtar a carência do autoatendimento; exclusão agendada pelo usuário só pode ser antecipada. Cancelamento possível enquanto houver prazo em curso; exclusão imediata, depois de executada, não pode ser cancelada (US10, FR-015, FR-036, FR-040).
  2. Cancelamento notifica o usuário: e-mail com texto genérico e aviso no aplicativo (FR-040, FR-042).
  3. Falha no aviso de exclusão com regra diferenciada: com prazo, a exclusão segue e o admin pode reenviar; imediata, só executa após aviso enviado e, se falhar, o admin escolhe entre tentar de novo e prosseguir sem aviso com confirmação reforçada, registrada na auditoria (US10, FR-038, SC-012, SC-016). [Superado na rodada 4, item 5: a exclusão sempre prossegue.]
  4. Motivos cadastráveis: 4 iniciais mais novos, cada um com mensagem genérica; criar, editar, desativar; iniciais não podem ser apagados; mensagem sem dados do usuário nem justificativa; auditoria de toda mudança; exclusão em andamento mantém a mensagem original (US11, FR-043 a FR-046, SC-015; entidade Motivo de exclusão).
  5. Justificativa livre PERSISTE na auditoria; só e-mail e nome são anonimizados; aviso no formulário orienta a não escrever dados pessoais; risco residual registrado como aceito (FR-039, FR-048, SC-011, premissas).
  6. Aviso também dentro do app (web e mobile) para exclusões com prazo, com prazo e motivo genérico, e aviso de cancelamento exibido uma vez; exclusão imediata só por e-mail; premissa de reaproveitar a tela de entrada e a data de exclusão já existentes (US12, FR-041, FR-042, SC-014; entidade Aviso de exclusão no aplicativo). O painel admin continua só web desktop.
  7. Premissas assumidas: motivos nunca apagados, apenas desativados e reativáveis; sempre ao menos um motivo ativo; mensagem fixada na solicitação (FR-046); exclusão imediata sem aviso enviado permanece aguardando decisão do admin. [Superado na rodada 4, item 5.] (A premissa "usuário não cancela exclusão pedida por admin" foi confirmada e generalizada na rodada 3.)
- Rodada 3 (2026-11-14), decisão do usuário: "Um usuário nunca poderá cancelar qualquer decisão administrativa." Regra geral (FR-047): nenhuma decisão administrativa (exclusão agendada ou imediata, suspensão, encerramento de sessões, redefinição forçada de senha, alteração de e-mail pelo admin) pode ser revertida, cancelada ou contornada pelo usuário afetado, por nenhum canal; só um administrador a reverte, pelo painel, com auditoria. Acréscimos: FR-049 (origem da exclusão: usuário ou administrador; antecipação a torna administrativa), FR-050 (tentativas recusadas e auditadas), SC-017, cenários US3.8, US4.6, US10.15 e 10.16, US12.6 e 12.8, caso de borda e premissa dedicados. Estado atual do código verificado só para coerência: hoje não há suspensão nem perfil administrativo; o login recusa apenas conta com exclusão pendente (data do pedido, sem origem) e oferece cancelar com credenciais, e a chamada de cancelamento aceita qualquer exclusão pendente; por isso a origem da exclusão é requisito novo (FR-049).
- Rodada 4 (2026-11-14, resultado do /speckit-clarify, 8 decisões do usuário; seção "Clarifications / Sessão 2026-11-14" na spec), sem marcadores de clarificação pendentes. Numeração FR/SC/US preservada; itens novos ao final (FR-051 a FR-061, SC-018 a SC-020, cenários adicionais ao fim de cada história):
  1. Troca de e-mail pelo admin não é imediata: código de 6 dígitos ao NOVO endereço, digitado pelo admin na própria tela; validade 15 min, uso único, novo pedido invalida o anterior, limite de erros, código nunca exibido nem gravado, cancelável, sessões encerradas na confirmação, tudo auditado sem o código; racional da prova de posse registrado (FR-014, FR-047, FR-052, US9.6 a 9.11, SC-018).
  2. Primeiro admin criado direto no banco pelo dono da implantação (e-mail de ambiente removido); roteiro documentado como requisito; admin raiz constante e intocável pelo painel; recuperação sempre pelo banco; salvaguarda do último admin e SC-008 cobrem concorrência e proteção do raiz (FR-003 a FR-005, FR-051, US1.4/1.8/1.9, SC-008).
  3. Cancelar exclusão antecipada devolve a conta ao agendamento original do usuário e restaura exatamente o estado anterior (inclusive suspensa); contradição US10.2 x FR-049 eliminada; solicitação guarda a exclusão anterior (FR-040, FR-042, FR-049, US10.2/10.16 a 10.18, US12.3/12.9, SC-014).
  4. Auditoria de tentativas deduplicada em janela de 15 min (autor/IP, alvo, tipo), com IP, inclusive visitantes; repetições só como métrica fora da auditoria; IP real via cabeçalho do Cloudflare só do túnel; limite de taxa nas ações do painel; SC-001 e SC-017 reescritos e contradição com o caso de borda removida (FR-002, FR-019, FR-050, FR-053 a FR-055).
  5. Exclusão (com prazo ou imediata) sempre prossegue; falha vira comunicação pendente com alerta permanente no painel e descarte auditado; removidos o estado "aguardando aviso", "prosseguir sem aviso" e a confirmação reforçada associada; endereço retido só no envio pendente (apagado ao entregar, descartar ou em 30 dias) (FR-015, FR-037, FR-038, FR-040, FR-056, FR-057, US10.9 a 10.12/10.20/10.21, US7.8, SC-012, SC-016). Muda a decisão da rodada 2, item 3.
  6. Modo de manutenção: usuários comuns sem acesso, offline do app guardado no aparelho, tarefas automáticas continuam, aceite de convite bloqueado, redefinição de senha funcionando, logados barrados na requisição seguinte (FR-029, FR-058, US8.7 a 8.11, US9.13, SC-019).
  7. Histórico de envios com retenção própria de 90 dias; auditoria indefinida; FR-039 estendido às quatro fontes (usuário excluído, convidados sem conta, e-mails antigos, nomes antigos) mais IP/dispositivo, com o endereço pendente como exceção documentada (FR-022, FR-027, FR-039, FR-059, SC-011).
  8. Sessões mostram IP e tipo de dispositivo; abertura do detalhe de usuário auditada; sem exportação de dados nesta versão; IP/dispositivo anonimizados na exclusão; aviso de privacidade como requisito (FR-008, FR-011, FR-018, FR-060, FR-061, SC-020).
  - Defaults assumidos sem pergunta ao usuário estão listados e sinalizados no fim das Premissas (reautenticação e limites, validade da sessão do admin, convite consumido por cadastro, parâmetros de paginação e estatística, suspensão sem aviso, extensões da proteção do raiz, entre outros).
- Rodada 5 (2026-11-14, ajuste pontual, decisão do usuário; Clarifications item 9): o IP de visitantes não autenticados na auditoria (acessos negados ao painel) é anonimizado após 90 dias, mantendo a linha da tentativa (tipo, momento, resultado, alvo) e trocando só o IP por identificador anônimo, estável e não reversível (correlação preservada). Fecha a lacuna do "IP de visitantes fica indefinidamente" (premissa removida e substituída pela decisão). Acréscimos: FR-062 (novo), SC-021 (novo); ajustados FR-020, FR-022, FR-039 e FR-061 (aviso de privacidade informa 90 dias para visitantes e exclusão da conta para usuários), entidade Registro de auditoria, casos de borda (dados pessoais de terceiros, auditoria muito grande, novo caso "IP de visitante com mais de 90 dias") e premissas de retenção. A anonimização por prazo é a única exceção adicional à imutabilidade (junto à do FR-039), feita pelo sistema, nunca por administrador. Sem marcadores de clarificação pendentes; numeração preservada, itens novos ao final.
- Numeração: o diretório `004-account-transfers` já existe em `main`, portanto esta feature recebeu `005`.
