import requests
import math
import logging
import collections
import sys
from decimal import *
import datetime
from functools import reduce
from datetime import date


def load(symbol):
    logging.info('Getting data')
    logging.debug('Load base API url')
    r = requests.get('https://www.dividend.com/search',
                     params={'q': symbol}, allow_redirects=False)
    base = r.headers['location']
    logging.debug('Load dividend payout history')
    r = requests.get(base+'payouthistory.json')
    json = r.json()
    for value in json['series'][0]['data']:
        div[value['parts']['Pay Date']] = Decimal(value['y'])
    logging.debug('Load stock prices history')
    r = requests.get(base+'yieldhistory.json')
    json = r.json()
    for value in json['series'][0]['data']:
        d = date.fromtimestamp(value['x']/1000)
        price[to_iso(d)] = Decimal(value['y'])


def us_state_tax(amount):
    """US dividend tax for non-residents."""
    return amount * Decimal('0.1')


def brokerage_commissions(stocks, price):
    """ IB stocks, ETFs and Warrants buy comission.
    https://www.interactivebrokers.com/en/index.php?f=1590&p=stocks1
    """
    min = Decimal('1')
    max = stocks * price * Decimal('0.01')
    per_share = Decimal('0.005')
    commission = stocks * per_share
    if commission <= min:
        return min
    return max if commission > max else commission


def buy(buf, price):
    """How much securities can we buy?"""
    i = 0
    while (True):
        i += 1
        if buf - (price * i + brokerage_commissions(i, price)) < 0:
            break
    return i-1


def from_iso(date_iso):
    return datetime.datetime.strptime(date_iso, '%Y-%m-%d')


def to_iso(date):
    return date.strftime('%Y-%m-%d')


def find_first_date(year):
    for d in price:
        if from_iso(d).year == year:
            return d
    logging.error("Security price history doesn't have date %d", year)


if len(sys.argv) < 2:
    print('\nUsage:  python3 sec_after_tax_growth.py SECURITY [INVESTMENT] [START YEAR] [END YEAR]',
          '\n\nExample: python3 sec_after_tax_growth.py VTI 20000 2015 2018')
    quit()

logging.basicConfig(
    format='%(asctime)s %(levelname)s: %(message)s', level=logging.INFO)
symbol = sys.argv[1]
div = collections.OrderedDict()
price = collections.OrderedDict()
MONTHLY_FEE = Decimal('10')

load(symbol)

investment = Decimal(sys.argv[2] if len(sys.argv) > 2 else '10000')
inception_date = from_iso(next(iter(price)))
last_date = from_iso(next(reversed(price)))
start_year = int(sys.argv[3]) if len(sys.argv) > 3 else inception_date.year+1
start_date_iso = find_first_date(start_year)
start_date = from_iso(start_date_iso)
end_year = int(sys.argv[4]) if len(sys.argv) > 4 else last_date.year
end_date_iso = find_first_date(end_year)
end_date = from_iso(end_date_iso)

logging.info('Calculate total returns from %s to %s', start_date_iso, end_date_iso)
monthly_fee = MONTHLY_FEE
cur_price = price[start_date_iso]
start_sec = buy(investment, cur_price)
end_sec = start_sec
start_total = start_sec * cur_price
monthly_fee -= max(brokerage_commissions(start_sec, cur_price), 0)
buf = investment - start_total
logging.info('Bought %d securities for $%.4f (remainder: $%.4f) on %s',
             start_sec, start_total, buf, start_date_iso)
cur_date = from_iso(start_date_iso)
cur_month = cur_date.month
cur_year = cur_date.year
years = end_year - start_year
annual_returns = []
year_start_total = cur_price * start_sec
while(cur_date <= end_date):
    cur_date_iso = to_iso(cur_date)
    if cur_date_iso not in price:
        cur_date += datetime.timedelta(days=1)
        continue
    if cur_date.year != cur_year:
        annual_return = (cur_price*end_sec)/year_start_total
        logging.info('%s annual return: %.2f%% ($%.2f - $%.2f)',
                     cur_year, (annual_return-1)*100, year_start_total, cur_price*end_sec)
        annual_returns.append(annual_return)
        cur_year = cur_date.year
        year_start_total = price[cur_date_iso]*end_sec
    cur_price = price[cur_date_iso]
    if cur_date_iso in div:
        amount = div[cur_date_iso]
        logging.info('%s dividend payout: $%.4f * %d',
                     cur_date_iso, amount, end_sec)
        logging.info('  security price: $%.4f', cur_price)
        divs = amount * end_sec
        buf += divs - us_state_tax(divs)
        logging.info('  after tax remainder: $%.4f', buf)
        to_buy = buy(buf, cur_price)
        if to_buy > 0:
            logging.info('  buy %d securities', to_buy)
            end_sec += to_buy
            commission = brokerage_commissions(to_buy, cur_price)
            monthly_fee -= commission
            buf -= to_buy * cur_price + commission
            logging.info('  new remainder: $%.4f', buf)
    cur_date += datetime.timedelta(days=1)
    if cur_date.month != cur_month:
        logging.info('%s monthly fee: $%.4f', cur_date_iso, monthly_fee)
        buf -= monthly_fee
        logging.info('  new remainder: $%.4f', buf)
        monthly_fee = MONTHLY_FEE
        cur_month = cur_date.month

days = (end_date - start_date).days
end_price = price[end_date_iso]
end_total = end_sec * end_price
cap_appr = end_total - start_total
cap_gains = cap_appr + buf
logging.info("Was: %s ($%.2f)", start_sec, start_total)
logging.info("Now: %s ($%.2f)", end_sec, end_total)
logging.info("Capital appreciation: $%.2f", cap_appr)
logging.info("Remainder: $%.2f", buf)
logging.info("Capital gains: $%.2f (%.2f%%)",
             cap_gains, cap_gains/start_total*100)
logging.info("Annual average return: %.2f%%",
             (reduce(lambda x, y: x*y, annual_returns)**Decimal(1/years)-1)*100)
