import Decimal from "decimal.js"
import {Chart} from "chart.js"

async function load(symbol: string): Promise<void> {
    console.info('Getting data')
    console.debug('Load base API url')
    // I hope my app will be rarely used, so it's ok to use third-party cors
    // proxy and also dividend.com won't complain.
    const proxy = 'https://cors-anywhere.herokuapp.com/';
    let res = await fetch(proxy + `https://www.dividend.com/search?q=${symbol}`);
    const base = proxy + res.headers.get('X-Final-Url');
    console.debug('Load dividend payout history')
    res = await fetch(base + 'payouthistory.json');
    let json = await res.json();
    json['series'][0]['data'].forEach((v: any) => {
        divs[v['parts']['Pay Date']] = new Decimal(v['y']);
    });
    console.debug('Load stock prices history')
    res = await fetch(base + 'yieldhistory.json');
    json = await res.json();
    json['series'][0]['data'].forEach((v: any) => {
        let d = new Date(v['x']);
        prices[toISO(d)] = new Decimal(v['y']);
    });
}

function toISO(d: Date): string {
    function pad(n: number) { return n < 10 ? '0' + n : n }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function fromISO(d: string): Date {
    return new Date(d);
}

// IB stocks, ETFs and Warrants buy commission
// https://www.interactivebrokers.com/en/index.php?f=1590&p=stocks1
function brokerageCommissions(stocks: number, price: Decimal): Decimal {
    const min = new Decimal(1)
    const max = price.times(stocks).times('0.01')
    const per_share = new Decimal('0.005')
    const commission = per_share.times(stocks)
    if (commission <= min)
        return min
    return commission > max ? max : commission
}

// How much securities can we buy?
function buy(buf: Decimal, price: Decimal): number {
    let i = 0;
    while (true) {
        i++;
        if (buf.minus(price.times(i).plus(brokerageCommissions(i, price))).isNegative())
            break;
    }
    return i - 1;
}

function findFirstDate(year: number): string {
    for (let d in prices) {
        if (fromISO(d).getFullYear() == year)
            return d
    }
    console.error(`Security price history doesn't have date ${year}`);
}

// US dividend tax for non-residents.
function us_state_tax(amount: Decimal): Decimal {
    return amount.times('0.1');
}

function addDay(d: Date): Date {
    const newDate = new Date(d.valueOf())
    newDate.setDate(newDate.getDate() + 1);
    return newDate;
}

async function main(): Promise<void> {
    Decimal.set({ precision: 4, defaults: true })

    await load('AGG');

    const MONTHLY_FEE = new Decimal(10);
    let investment = new Decimal(10000);
    let inception_date = fromISO(Object.keys(prices).shift());
    let last_date = fromISO(Object.keys(prices).pop());
    let start_year = inception_date.getFullYear() + 1;
    let start_date_iso = findFirstDate(start_year);
    let start_date = fromISO(start_date_iso);
    let end_year = last_date.getFullYear();
    let end_date_iso = findFirstDate(end_year);
    let end_date = fromISO(end_date_iso);

    console.info(`Calculate total returns from ${start_date_iso} to ${end_date_iso}`)
    let monthly_fee = MONTHLY_FEE;
    let cur_price = prices[start_date_iso];
    let start_sec = buy(investment, cur_price);
    let end_sec = start_sec;
    let start_total = cur_price.times(start_sec);
    monthly_fee = monthly_fee.minus(Decimal.max(brokerageCommissions(start_sec, cur_price), 0));
    let buf = investment.minus(start_total);
    console.info(`Bought ${start_sec} securities for $${start_total} (remainder: $${buf}) on ${start_date_iso}`)
    let cur_date = fromISO(start_date_iso);
    const chartPoints: Point[] = []
    chartPoints.push({x: cur_date, y: investment.toNumber()})
    let cur_month = cur_date.getMonth() + 1;
    let cur_year = cur_date.getFullYear();
    let years = end_year - start_year;
    const annual_returns: Decimal[] = [];
    let year_start_total = cur_price.times(start_sec);
    interface Point {
        x: Date;
        y: number;
    }
    while (cur_date <= end_date) {
        let cur_date_iso = toISO(cur_date);
        if (!prices[cur_date_iso]) {
            cur_date = addDay(cur_date);
            continue;
        }
        if (cur_date.getFullYear() != cur_year) {
            const annual_return = cur_price.times(end_sec).dividedBy(year_start_total);
            console.info(`${cur_year} annual return: ${annual_return.minus(1).times(100)}% ($${year_start_total} - $${cur_price.times(end_sec)})`)
            annual_returns.push(annual_return);
            cur_year = cur_date.getFullYear();
            year_start_total = prices[cur_date_iso].times(end_sec);
        }
        cur_price = prices[cur_date_iso];
        if (divs[cur_date_iso]) {
            const amount = divs[cur_date_iso];
            console.info(`${cur_date_iso} dividend payout: $${amount} * ${end_sec}`);
            console.info(`  security price: $${cur_price}`);
            const div = amount.times(end_sec);
            buf = buf.plus(div.minus(us_state_tax(div)));
            console.info(`  after tax remainder: $${buf}`)
            const to_buy = buy(buf, cur_price)
            if (to_buy > 0) {
                console.info(`  buy ${to_buy} securities`)
                end_sec += to_buy
                const commission = brokerageCommissions(to_buy, cur_price);
                monthly_fee = monthly_fee.minus(commission);
                buf = buf.minus(cur_price.times(to_buy).plus(commission));
                console.info(`  new remainder: $${buf}`)
            }
        }
        cur_date = addDay(cur_date);
        if (cur_date.getMonth() + 1 != cur_month) {
            console.info(`${cur_date_iso} monthly fee: $${monthly_fee}`)
            buf = buf.minus(monthly_fee);
            console.info(`  new remainder: $${buf}`)
            monthly_fee = MONTHLY_FEE;
            cur_month = cur_date.getMonth() + 1;
        }
        chartPoints.push({x: cur_date, y: cur_price.times(end_sec).plus(buf).toNumber()})
    }
    const end_price = prices[end_date_iso];
    const end_total = end_price.times(end_sec);
    const cap_appr = end_total.minus(start_total);
    const cap_gains = cap_appr.plus(buf);
    const annual_average_return = annual_returns.reduce((x, y) => x.times(y)).toPower(1 / years).minus(1).times(100);
    console.info(`Was: ${start_sec} ($${start_total})`);
    console.info(`Now: ${end_sec} ($${end_total})`);
    console.info(`Capital appreciation: $${cap_appr}`);
    console.info(`Remainder: $${buf}`);
    console.info(`Capital gains: $${cap_gains} (${cap_gains.dividedBy(start_total).times(100)}%)`);
    console.info(`Annual average return: ${annual_average_return.toPrecision()}%`);
    
    const ctx = (document.getElementById('chart') as HTMLCanvasElement).getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: "Growth",
                data: chartPoints,
                pointRadius: 0,
            }]
        },
        options: {
            tooltips: {
                callbacks: {
                    label: function(tooltipItem) {
                        return '$'+tooltipItem.yLabel;
                    }
                },
                mode: 'index',
                intersect: false
            },
            hover: {
                mode: 'index',
                intersect: false
            },
            elements: {
                line: {
                    // Disable bezier curves to speed up rendering.
                    tension: 0,
                }
            },
            scales: {
                xAxes: [{
                    type: 'time',
                    time: {
                        unit: 'month',
                        tooltipFormat: 'YYYY-MM-DD'
                    }
                }],
                yAxes: [{
                    ticks: {
                        callback: function(value) {
                            return '$' + value;
                        }
                    }
                }]
            }
        },
    });
}

let prices: { [index: string]: Decimal } = {};
let divs: { [index: string]: Decimal } = {};
main();
