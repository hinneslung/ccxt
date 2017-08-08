"use strict";

const ccxt      = require ('../../ccxt.js')
const asTable   = require ('as-table')
const log       = require ('ololog').configure ({ locate: false })
const fs        = require ('fs')


require ('ansicolor').nice;

let sleep = (ms) => new Promise (resolve => setTimeout (resolve, ms));

let proxies = [
    '', // no proxy by default
    'https://crossorigin.me/',
    'https://cors-anywhere.herokuapp.com/',
];

(async function main () {

    let ids = ccxt.exchanges
    let exchanges = {}

    // instantiate all exchanges
    ccxt.exchanges.forEach (id => {
        exchanges[id] = new (ccxt)[id] ({
            verbose: false,
            substituteCommonCurrencyCodes: true,
        })
    })

    // load api keys from config
    let config = JSON.parse (fs.readFileSync ('./keys.json', 'utf8'))

    // set up api keys appropriately
    for (let id in config)
        for (let key in config[id])
            exchanges[id][key] = config[id][key]

    log (ids.join (', ').yellow)

    // load all markets from all exchanges 

    await Promise.all (ids.map (async id => {

        let exchange = exchanges[id]

        // basic round-robin proxy scheduler
        let currentProxy = 0
        let maxRetries   = proxies.length
        
        for (let numRetries = 0; numRetries < maxRetries; numRetries++) {

            try { // try to load exchange markets using current proxy

                exchange.proxy = proxies[currentProxy]
                await exchange.loadMarkets ()

            } catch (e) { // rotate proxies in case of connectivity errors, catch all other exceptions

                // swallow connectivity exceptions only
                if ((e instanceof ccxt.DDoSProtectionError) || e.message.includes ('ECONNRESET')) {
                    log.bright.yellow (exchange.id + ' [DDoS Protection Error]')
                } else if (e instanceof ccxt.TimeoutError) {
                    log.bright.yellow (exchange.id + ' [Timeout Error] ' + e.message)
                } else if (e instanceof ccxt.AuthenticationError) {
                    log.bright.yellow (exchange.id + ' [Authentication Error] ' + e.message)
                } else if (e instanceof ccxt.ExchangeNotAvailableError) {
                    log.bright.yellow (exchange.id + ' [Exchange Not Available Error] ' + e.message)
                } else if (e instanceof ccxt.ExchangeError) {
                    log.bright.yellow (exchange.id + ' [Exchange Error] ' + e.message)
                } else {
                    throw e; // rethrow all other exceptions
                }

                // retry next proxy in round-robin fashion in case of error
                currentProxy = ++currentProxy % proxies.length 
            }
        }

        if (exchange.symbols)
            log (id.green, 'loaded', exchange.symbols.length.green, 'markets')

    }))

    log ('Loaded all markets'.green)

    let table = ccxt.exchanges.map (id => {
        console.log (id)
        let exchange = exchanges[id]
        if (exchange.currencies) {
            let hasBCC = exchange.currencies.includes ('BCC')
            let hasBCH = exchange.currencies.includes ('BCH')
            let hasBoth = (hasBCC && hasBCH)
            return {
                id,
                'BCC': hasBoth ? id.green : (hasBCC ? id.yellow : ''),
                'BCH': hasBCH ? id.green : '',
            }            
        } else {
            return {
                'id': id.red,
                'BCC': '',
                'BCH': '',
            }
        }
    })

    log (asTable.configure ({ delimiter: ' | ' }) (table))

    process.exit ()

}) ()