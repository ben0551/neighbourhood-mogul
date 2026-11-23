# Neighbourhood Mogul

A browser game for ages 8+ that teaches the three big money lessons:

1. **Income buys assets**
2. **Debt can help or hurt depending on how it's used**
3. **Cash flow matters more than wealth on paper**

You start with a small house, a home loan and a simple job. Each week you collect
income, pay bills, and spend 2 actions on your career, property or finances.
The winner isn't the richest — the winner reaches **Financial Freedom**: your
Money Makers (rents and businesses) cover all your bills.

## Play

Hosted on GitHub Pages — just open the URL. No build step, no dependencies:
plain HTML/CSS/JavaScript. Progress is saved in `localStorage`.

## Modes

- **Beginner** — reach $50,000 total wealth or own 3 properties.
- **Financial Freedom** — passive income ≥ all weekly expenses (the ideal endpoint).

**Finance mode** (top right) swaps the kid words for the real terms:
Money Makers → Assets, Money Takers → Liabilities, Money Left Over → Cash Flow,
Total Wealth → Net Worth, Borrowing Cost → Interest.

## What's in the game

- Procedurally generated neighbourhood (5–7 streets with desirability, school,
  crime and growth scores that drive prices, rents and appreciation)
- 4 property types (small house, family house, duplex, apartment block) with
  mortgages, deposits, credit-score-dependent interest rates
- Renovations: paint, kitchen, solar panels, repairs
- Career tree: 3 starter jobs → intermediate trades → professional degrees →
  entrepreneur (businesses)
- Courses that cost money and take weeks — spend now, earn more later
- Credit score (★ to ★★★★★) affected by missed payments and on-time streaks
- Weekly random events (promotion, roof leak, tenant leaves, rate rises…)
- Vacancy, condition decay, interest-rate market

## Files

```
index.html      screens and structure
style.css       all styling (mobile-first)
game.js         pure game engine — no DOM, serialisable state
ui.js           DOM controller and rendering
tools/balance.js  headless balance harness (Node)
```

## Balance

`node tools/balance.js freedom 200` simulates a sensible player over 200 seeds:

| mode | win rate | win week (p25 / median / p75) |
|------|----------|-------------------------------|
| beginner | 100% | 60 / 68 / 73 |
| freedom | 100% | 162 / 172 / 187 |

One week is one turn; a typical turn takes ~10 seconds, so Financial Freedom
lands around a 30-minute session.
