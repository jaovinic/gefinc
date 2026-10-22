# GEFINC — Manual de Identidade Visual & Design System

---

## 1. Conceito e Posicionamento da Marca

### 1.1 O Nome
**GEFINC** deriva da junção de **Ge**stão **Fin**anceira e **C**ontrole (ou *Capital* / *Crescimento*). É um nome curto, foneticamente firme e de tom corporativo-tecnológico.

### 1.2 Personalidade da Marca (Brand Persona)
* **Confiável & Robusta:** Não parece uma fintech experimental volátil; passa a segurança de engenharia de dados (ecoando a infraestrutura Spring Boot + PostgreSQL).
* **Precisa & Cirúrgica:** Valoriza a visualização sem ruído visual. Os dados e números são os protagonistas.
* **Proativa & Moderna:** Antecipa faturas, parcelas e projeções futuras com gráficos de alto contraste e legibilidade imediata em telas mobile (OLED) e monitores desktop ultrawide.

### 1.3 O Arquétipo da Marca
* **O Governante / O Sábio:** Foco no controle absoluto do próprio destino financeiro, clareza lógica sobre onde o dinheiro está alocado e planejamento de longo prazo.

---

## 2. Logotipo, Símbolo & Ícone do App

### 2.1 Conceito do Símbolo: *O Prisma Hexagonal de Balanço*
O símbolo do GEFINC é composto pela fusão de três elementos geométricos integrados:
1. **O Glifo "G":** Uma curva externa em geometria vetorial contínua.
2. **A Seta de Fluxo e Crescimento ($\nearrow$):** A barra central do "G" avança diagonalmente para cima e para a direita em um ângulo exato de $45^\circ$, simbolizando projeção futura e valorização patrimonial.
3. **Divisão de Parcelas/Fatias:** A terminação inferior da curva do "G" é segmentada em 3 blocos escalonados sutis, aludindo a controle de fluxo parcelado e cartões de crédito.

### 2.2 Grid e Construção Geométrica
* **Proporção Base:** Grid de $8 \times 8$ com raios de curvatura de $16\text{px}$ nos cantos externos.
* **Ângulo Dinâmico:** Cortes e vetores diagonais em $45^\circ$.
* **Área de Respiro (Clear Space):** Margem mínima de segurança igual à altura da letra "G" em toda a volta do logotipo.

### 2.3 Ícone para App Mobile (Android Adaptive Icon & iOS App Icon)
* **Fundo:** Deep Void Obsidian (`#0B0F19`) com um sutil gradiente radial centralizado com 15% de opacidade em Teal Elétrico.
* **Glifo Central:** O símbolo "G" em gradiente *Aurora FinTech* (`#00E599` $\to$ `#00B4D8`).
* **Borda Tátil:** Sutil borda interna de $1\text{px}$ com $10\%$ de branco translúcido (`rgba(255, 255, 255, 0.1)`), garantindo contraste absoluto tanto no modo escuro quanto claro do sistema operacional.

---

## 3. Paleta Cromática (Color Tokens)

A paleta foi desenhada priorizando telas OLED móveis (economia de energia e contraste dinâmico) e dashboards densos para a web, evitando a saturação excessiva que causa fadiga visual.

### 3.1 Cores Primárias (Identidade Central)
* **Obsidian Deep (Fundo Primário Dark):** `#090D16`
  * Uso: Background da aplicação mobile e web dark mode.
* **Surface Slate (Superfície de Cards/Containers):** `#131B2E`
  * Uso: Cards de contas, faturas de cartões, modais e sidebars.
* **Surface Border (Divisores e Contornos):** `#1E293B`
  * Uso: Bordas estruturais, divisões de tabelas e grids.

### 3.2 Cores de Acento & Destaque (Brand Accents)
* **Aurora Emerald (Verde Fluxo / Receita / Primária):** `#00E599`
  * *Significado:* Entradas, saldos positivos, quitações, ações de confirmação principal.
  * *Gradiente de Marca (Hero Gradient):* `linear-gradient(135deg, #00E599 0%, #00B4D8 100%)`
* **Electric Cyan (Secundária / Acento Tecnológico):** `#00B4D8`
  * *Significado:* Links, seleções ativas, barras de progresso de parcelas concluídas.
* **Vibrant Violet (Terciária / Planejamento Futuro):** `#7C3AED`
  * *Significado:* Indicador de gastos recorrentes fixos, previsões orçamentárias e metas.

### 3.3 Cores Semânticas de Gestão Financeira
* **Crimson Hazard (Despesa / Vencido / Alerta Crítico):** `#F43F5E`
  * Uso: Valores negativos, parcelas em atraso, faturas fechadas não pagas.
* **Amber Horizon (A Vencer / Atenção / Pendente):** `#F59E0B`
  * Uso: Parcelas a vencer nos próximos 5 dias, cartões próximos ao fechamento.
* **Slate Muted (Texto Secundário / Labels neutras):** `#94A3B8`
* **Pure Light (Texto Primário Dark Mode):** `#F8FAFC`

---

## 4. Tipografia do Sistema

Para máxima performance no Angular e Ionic sem custos pesados de download de fontes de terceiros, adota-se uma tipografia moderna, legível e otimizada para números.

### 4.1 Família Primária: **Plus Jakarta Sans** ou **Inter**
* *Font-Family:* `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;`
* *Por que:* Excelente desenho geométrico moderno e legibilidade excepcional em tamanhos reduzidos (11px–13px em tabelas e listas móveis).

### 4.2 Configuração Numérica Obrigatória (Tabular Figures)
Para dashboards financeiros, tabelas e listas de lançamentos, os algarismos devem ser **monoespaçados** para evitar que números oscilem visualmente de largura:
```css
.financial-value, .currency-display, table td {
  font-feature-settings: "tnum" on, "lnum" on;
}
```

### 4.3 Escala Tipográfica (Type Scale)

| Token | Tamanho | Altura da Linha (Line-height) | Peso (Weight) | Uso Típico |
| :--- | :--- | :--- | :--- | :--- |
| `display-1` | $32\text{px}$ / $2\text{rem}$ | $38\text{px}$ | 800 (Bold) | Saldo total consolidado no topo |
| `title-lg` | $24\text{px}$ / $1.5\text{rem}$ | $30\text{px}$ | 700 (Bold) | Títulos de dashboards e faturas |
| `title-md` | $18\text{px}$ / $1.125\text{rem}$ | $24\text{px}$ | 600 (SemiBold) | Nomes de cartões e grupos de despesas |
| `body-base` | $14\text{px}$ / $0.875\text{rem}$ | $20\text{px}$ | 400 (Regular) | Linhas de extrato, descrições de lojas |
| `caption` | $12\text{px}$ / $0.75\text{rem}$ | $16\text{px}$ | 500 (Medium) | Dia de fechamento, parcelas `4/10` |
| `micro` | $10\text{px}$ / $0.625\text{rem}$ | $12\text{px}$ | 700 (Bold/Caps) | Badges de status (`PAGO`, `PEND`) |

---

## 5. Linguagem Visual dos Componentes (UI Tokens)

### 5.1 Card de Cartão de Crédito Físico/Virtual (Mobile & Web)
Inspirado na planilha pessoal onde cada cartão possui sua identidade (Nubank, Mercado Pago, Bradesco, Pan, etc.):
* **Fundo:** Superfície com gradiente sutil simulando o acabamento metálico ou fosco da instituição (`#1A2238` a `#101726`).
* **Borda:** $1\text{px}$ em degradê suave refletindo a cor do cartão real (ex: Roxo sutil para Nubank, Azul sutil para MP/Bradesco).
* **Indicador de Parcela:** Uma barra de progresso horizontal fina ($4\text{px}$) na base do card demonstrando:
  $$\text{Progresso} = \left(\frac{\text{Parcelas Pagas}}{\text{Total de Parcelas}}\right) \times 100\%$$
  * Pago: preenchimento em `#00E599`
  * Restante: trilha em `#1E293B`

### 5.2 Badges de Status (Pílulas de Identificação)
* **Pendente (`Pend`):** Fundo `rgba(245, 158, 11, 0.12)`, texto `#F59E0B`, borda `rgba(245, 158, 11, 0.25)`.
* **Liquidado/Concluído (`Qtd` / `Pago`):** Fundo `rgba(0, 229, 153, 0.12)`, texto `#00E599`, borda `rgba(0, 229, 153, 0.25)`.
* **A Vencer Imediato:** Fundo `rgba(244, 63, 94, 0.12)`, texto `#F43F5E`, borda `rgba(244, 63, 94, 0.25)`.

### 5.3 Microinterações e Feedback Tátil (Mobile Haptics)
* No app Ionic móvel, ao confirmar o pagamento de uma parcela ou lançamento de despesa, disparar microvibração háptica rápida (`Haptics.impact({ style: ImpactStyle.Light })`) e uma animação suave de transição de cor do badge para verde.

---

## 6. Configuração de Cores para Tailwind CSS (`tailwind.config.js`)

Para uso imediato no pacote compartilhado `packages/ui-shared` do seu monorepo Nx:

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './apps/**/*.{html,ts}',
    './packages/**/*.{html,ts}'
  ],
  theme: {
    extend: {
      colors: {
        gefinc: {
          bg: '#090D16',
          surface: '#131B2E',
          border: '#1E293B',
          muted: '#94A3B8',
          text: '#F8FAFC',
          primary: '#00E599',
          secondary: '#00B4D8',
          accent: '#7C3AED',
          danger: '#F43F5E',
          warning: '#F59E0B',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
```