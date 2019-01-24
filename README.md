# sec_after_tax_growth.py
Shows historical price growth of $X (default: 10000) during a certain period of
years (default: (since inception + 1 year) -> first date of current year) with
dividends reinvestment after taxes and IB brokerage fees.

## Assumptions:
- You specify only full years
- It's US security - stock or ETF
- Broker is IB, registered in US
- Holder is non-us resident, so he pays 10% US state tax from dividends
- Holder has an IB account with fixed commissions for orders, which are $0.005 per share, with $1.00 minimum and 1.0% maximum
- Holder has less than $100000 in equities on brokerage account, so he should pay $10 monthly fee (minus commissions when securities bought)
- Holder buys new securities when he has enough money on his account
- The only source of income to his account is dividends
- Holder can't buy part of security, only full ones

## What else holder should take into account:
- Bank transfer fees
- Brokerage withdrawal fees
- Local dividend taxes
- Local capital gains taxes
- Inflation
