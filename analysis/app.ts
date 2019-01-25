import Decimal from "decimal.js"

let prices: { [index: string]: Decimal } = {};
let divs: { [index: string]: Decimal } = {};

async function main(): Promise<void> {
    const proxy = 'https://cors-anywhere.herokuapp.com/';
    let res = await fetch(proxy + 'https://www.dividend.com/search?q=VTI');
    const base = proxy + res.headers.get('X-Final-Url');
    res = await fetch(base + 'payouthistory.json');
    let json = await res.json();
    json['series'][0]['data'].forEach((v: any) => {
        divs[v['parts']['Pay Date']] = new Decimal(v['y']);
    });
    res = await fetch(base + 'yieldhistory.json');
    json = await res.json();
    json['series'][0]['data'].forEach((v: any) => {
        let d = new Date(v['x']);
        prices[toISO(d)] = new Decimal(v['y']);
    });
    console.log(prices, divs);
}

function toISO(d: Date): string {
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

main();
