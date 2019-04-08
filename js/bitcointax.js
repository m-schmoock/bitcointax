const PREFIX_BTCDE         = 'Datum;Typ;W'; //ährungen;Referenz;Kurs;"BTC vor Gebühr";"EUR vor Gebühr";"BTC nach Gebühr";"EUR nach Gebühr";"Zu- / Abgang";Kontostand';
const PREFIX_BITWALA_BANK  = '"Recipient IBAN","Reference","Amount","Currency","Created At","Updated At","ID"';
const PREFIX_BITWALA_TOPUP = '"Amount","Currency","Created At","Updated At","ID","Card ID"';
const PREFIX_XAPO          = 'datetime,description,btc_amount,btc_debits,btc_credits,currency,currency_amount,status,from,to,btc_txid,initiated_by,notes';
const PREFIX_KRAKEN        = '"txid","ordertxid","pair","time","type","ordertype","price","cost","fee","vol","margin","misc","ledgers"';
const PREFIX_OTC           = '#date;volume_btc;price_eur_per_btc;volume_eur;btc_txid;btc_addr;recipient'
const PREFIX_WALLETS       = '#PUBKEY;TYPE;SUBTYPE;ACCOUNT;WALLET;COMMENT'

const YEAR_MILLIS = 60*60*24*365*1000;
const SATOSHI = 0.00000001;
const BTCAVG_OLDEST_LOCAL = new Date("2013-09-03 00:00:00");

var btcavg = btcavg_local;

var _S;    // state variable
var fifo   = true;
var hodl   = true;

// math round helpers
Number.prototype.r2 = function(){ return Math.round(this * 1e2) / 1e2; }
Number.prototype.r4 = function(){ return Math.round(this * 1e4) / 1e4; }

function newState(){
    return {
        buys  : [],
        sells : [],
        stake : [],
        years : {}
    };
}

function newYear(index){
    _S.years[index] = {
        profit : 0.0,
        invest : 0.0,
        liquidated : 0.0,
        bought_for : 0.0,
        fees : 0.0
    }
}

function cleanup(){
    fifo   = true;
    hodl   = true;
    $('#history').empty();
    $('#sells').empty();
    _S = newState();
    newYear("all");
}

// loads new btc average data from source into localStorage
function fetchBtcAvg(){
    var url = "https://apiv2.bitcoinaverage.com/indices/local/history/BTCEUR?period=alltime&format=json";
    $.getJSON(url, function(data) {
        localStorage.btcavg = JSON.stringify(data);
        btcavg = data;
        console.log('loaded new bitcoinaverage_local data: '+data.length+' days.');
    });
};

// loads btc average from localStorage cache
function loadBtcAvg(){
    return; // TODO: fixme using API creds. Take shipped data for now.
    // fetch recent BtcAvg data into localStorage
    // update only if most recent data is older than a day
    btcavg = JSON.parse(localStorage.btcavg || '[]');
    var yesterday = new Date(new Date().toDateString()) - (1000*60*60*24);
    if (btcavg.length == 0 || new Date(btcavg[0].time) < yesterday) fetchBtcAvg();
};

// reads input files and adds/sorts to buys/sells arrays
function processInput(){
    // add anything from all files
    $('.input').each(function(i, e){
        var data = $(e).val();
        if      (data.startsWith(PREFIX_BTCDE))         doBitcoinDe(data);
        else if (data.startsWith(PREFIX_BITWALA_BANK))  doBitwalaBank(data);
        else if (data.startsWith(PREFIX_BITWALA_TOPUP)) doBitwalaTopup(data);
        else if (data.startsWith(PREFIX_XAPO))          doXapo(data);
        else if (data.startsWith(PREFIX_KRAKEN))        doKraken(data);
        else if (data.startsWith(PREFIX_OTC))           doOtc(data);
        else if (data.startsWith(PREFIX_WALLETS))       doWallets(data);
        else alert('Input not suported: '+$(e).prev().html());
    });
}

// this renders the FIFO/LIFO controls per input sells year
function yearlyControls(){
    $('#yearlySettings').empty();

    cleanup();
    processInput();
    var inputyears = {};

    $.each(_S.sells, function(index, sell){
        var year = sell.date.getFullYear();
        if (inputyears[year]) return true;
        inputyears[year] = true;
        var controls = '<div style="float:left; margin-right:10px">['+year+': <label><input class="check_fifo_year" name="check_fifo_'+year+'" id="check_fifo_'+year+'" type="radio" '+(fifo?'checked':'')+'>FIFO</label><label><input class="check_lifo_year" name="check_fifo_'+year+'" id="check_lifo_'+year+'" type="radio" '+(fifo?'':'checked')+'>LIFO</label>]</div>';
        $('#yearlySettings').append($(controls));

        // set 2013 to LIFO (because I did it that way)
        if (year === 2013) $('#check_lifo_2013').attr('checked', 'true');
    });
}

function readFiles(e) {
    var fileCounter = 0;
    for (let i = 0; i < e.target.files.length; i++){
        var file = e.target.files[i];
        if (!file) return;
        let filename = file.name;
        var reader = new FileReader();
        fileCounter++;
        reader.onload = function(e) {
            var input = $('<textarea class="input" id="input_'+i+'" rows="10" cols="200"></textarea>');
            input.val(e.target.result);
            $('#inputs').append($('<h3 class="inputh3">'+filename+'</h3>'));
            $('#inputs').append(input);
        };
        reader.onloadend = function(){
            fileCounter--;
            if (fileCounter == 0) yearlyControls();
        };
        reader.readAsText(file);
    }
}

$(document).ready(function(){
    // bind GUI handlers
    $('#files').change(readFiles);
    $('.check_fifo').change(function(e){
        if ($(this).prop('id') == 'check_fifo' && $(this).prop('checked')) fifo = true;
        if ($(this).prop('id') == 'check_lifo' && $(this).prop('checked')) fifo = false;
        // update yearly controls if changed
        $('.check_fifo_year').prop('checked', fifo);
        $('.check_lifo_year').prop('checked', !fifo);
    });
    $('.check_hodl').change(function(e){
        hodl = $(this).prop('checked');
    });
});

function btcavgLookup(date){
    if (typeof(date) === 'string') date = new Date(date);
    var history = btcavg;
    // local data is more acurate but global data is older
    if (date < BTCAVG_OLDEST_LOCAL) history = btcavg_global;

    // lookup daily bitcoinaverage eur rate
    // TODO: increase performance by not always starting at 0
    for (var k = 0; k < history.length; k++){
        var day = new Date(history[k].time);
        if (day > date) continue;
        var rate = history[k].average;
        break;
    }
    // check up2date data available
    if (date.toDateString() !== day.toDateString())
        throw "Error: Bitcoin average historic price data outdated! https://apiv2.bitcoinaverage.com/indices/local/history/BTCEUR?period=alltime&format=json";
    return rate;
}

function doBitcoinDe(data){
    // read csv
    var csv = $.csv.toArrays(data, {
        delimiter: '"', // sets a custom value delimiter character
        separator: ';'  // sets a custom field separator character
    });
    //alert(JSON.stringify(csv));

    // add TX to buys and sells
    $.each(csv, function(index, row){
        if (row.length != 11) throw 'Error: invalid btcde data at line '+index;
        if (index == 0) return true; // skip header

        var buy  = row[1] == 'Kauf';
        var sell = row[1] == 'Verkauf';
        if (!(buy || sell)) return true;

        var curr = row[2];
        if (curr !== 'BTC / EUR') throw 'Error: only euro supported';

        var vol_btc = Number(row[7]);
        var vol_eur = Number(row[8]);
        var fee_eur = Number(row[6]) - vol_eur;
        // note: we use rate without fees
        var rate    = vol_eur/vol_btc; // Number(row[4]); 

        var tx = {
            source  : 'btcde',
            index   : index,
            date    : new Date(row[0]),
            ref     : row[3],
            vol_btc : vol_btc.r4(),
            vol_eur : vol_eur.r2(),
            fee_eur : fee_eur.r2(),
            rate    : rate.r2(),
            rest    : 1.0,
        };

        if (buy) _S.buys.push(tx);
        if (sell) _S.sells.push(tx);
    });
}

function doBitwalaBank(data){
    // read csv
    var csv = $.csv.toArrays(data, {
        delimiter:'"', // sets a custom value delimiter character
        separator:','  // sets a custom field separator character
    });
    //alert(JSON.stringify(csv));
    
    // add TX to buys and sells
    $.each(csv, function(index, row){
        if (row.length != 7) throw 'Error: invalid bitwala_bank data at line '+index;
        if (index == 0) return true; // skip header

        // "Recipient IBAN","Reference","Amount","Currency","Created At","Updated At","ID"'
        // "DE...","KdNr ... - BstNr ...",59.02,"EUR","2017-03-11","2017-03-13","jdvj3..."
        var iban     = row[0];
        var subject  = row[1];
        var vol_eur  = Number(row[2]);
        var currency = row[3];
        var date     = new Date(row[4]);
        var ref      = row[6];

        if (currency !== "EUR") throw '['+index+'] Error: only EUR supported, got: '+currency;

        var btcavg_rate = btcavgLookup(date);
        // bitwala has minimal 1 Eur fix fee or 0.5% for any TX
        var fee_eur = Math.max(1.0, vol_eur * 0.005);
        // also bitpay is taking its share via hidden fees in bad rates

        var vol_btc = (vol_eur + fee_eur) / btcavg_rate;

        _S.sells.push({
            source  : 'bitwl',
            index   : index,
            date    : date,
            ref     : ref.substr(0,8),
            vol_btc : vol_btc.r4(),
            vol_eur : vol_eur.r2(),
            fee_eur : fee_eur.r2(),
            rate    : (vol_eur / vol_btc).r2(),
            rest    : 1.0,
        });
    });
}

function doBitwalaTopup(data){
    // read csv
    var csv = $.csv.toArrays(data, {
        delimiter:'"', // sets a custom value delimiter character
        separator:','  // sets a custom field separator character
    });
    //alert(JSON.stringify(csv));

    // "Amount","Currency","Created At","Updated At","ID","Card ID"
    // 100,"EUR","2016-08-11","2016-08-11","ZsWkls3S...","tJwsKW..." 

    // add TX to buys and sells
    $.each(csv, function(index, row){
        if (row.length != 6) throw 'Error: invalid bitwala_topup data at line '+index;
        if (index == 0) return true; // skip header

        var vol_eur  = Number(row[0]);
        var currency = row[1];
        var date     = new Date(row[2]);
        var ref      = row[4];

        if (currency !== "EUR") throw '['+index+'] Error: only EUR supported, got: '+currency;

        var btcavg_rate = btcavgLookup(date);
        // bitwala has minimal 1 Eur fix fee or 0.5% for any TX
        var fee_eur = Math.max(1.0, vol_eur * 0.005);
        // also bitpay is taking its share via hidden fees in bad rates

        var vol_btc = (vol_eur + fee_eur) / btcavg_rate;

        _S.sells.push({
            source  : 'bitwl_top',
            index   : index,
            date    : date,
            ref     : ref.substr(0,8),
            vol_btc : vol_btc.r4(),
            vol_eur : vol_eur.r2(),
            fee_eur : fee_eur.r2(),
            rate    : (vol_eur / vol_btc).r2(),
            rest    : 1.0,
        });
    });
}

function doXapo(data){
    // read csv
    var csv = $.csv.toArrays(data, {
        delimiter:'"', // sets a custom value delimiter character
        separator:','  // sets a custom field separator character
    });
    //alert(JSON.stringify(csv));
    
    // add TX to buys and sells
    $.each(csv, function(index, row){
        if (row.length != 13) throw 'Error: invalid xapo data at line '+index;
        if (index == 0) return true; // skip header

        var date        = new Date(row[0]);
        var description = row[1];
        var vol_btc     = Number(row[2]);
        var btc_debit   = Number(row[3]);
        var btc_credit  = Number(row[4]);
        var currency    = row[5];
        var vol_eur     = Number(row[6]);
        var status      = row[7];
        var from        = row[8];
        var to          = row[9];
        var txid        = row[10];

        if (status === 'Canceled') return true;
        if (txid !== '') return true; // personal btc transactions are not tax relevant
        if (btc_debit === 0) return true; // only btc 'sells' (debits) are relevant
        if (status !== 'Complete' && status !== 'Processing') throw 'Error: invalid xapo data at line '+index;
        if (currency !== 'EUR') throw 'TODO: xapo does not implement btcavg lookups for non-eur currencies';

        var rate = vol_eur / vol_btc;
        var btcavg_rate = btcavgLookup(date);
        var fee_rate = (btcavg_rate / rate) - 1.0;

        var tx = {
            source  : 'xapo',
            index   : index,
            date    : date,
            ref     : 'xapo_'+index,
            vol_btc : vol_btc.r4(),
            vol_eur : (vol_btc * rate).r2(),
            //fee_eur : (vol_eur * fee_rate).r2(), // xapo has hidden exchange fee
            fee_eur : 0,
            rate    : rate.r2(),
            rest    : 1.0,
        };

        _S.sells.push(tx);
    });
}

function doKraken(data){
    // read csv
    var csv = $.csv.toArrays(data, {
        delimiter:'"', // sets a custom value delimiter character
        separator:','  // sets a custom field separator character
    });
    //alert(JSON.stringify(csv));
    
    // add TX to buys and sells
    $.each(csv, function(index, row){
        if (row.length <= 12) throw 'Error: invalid kraken data at line '+index;
        if (index == 0) return true; // skip header

        var txid        = row[0];
        var pair        = row[2];
        var date        = new Date(row[3]);
        var type        = row[4];
        var rate        = Number(row[6]);
        var vol_eur     = Number(row[7]);
        var fee         = Number(row[8]);
        var vol_btc     = Number(row[9]);

        var tx = {
            source  : 'kraken',
            index   : index,
            date    : date,
            ref     : txid,
            vol_btc : vol_btc.r4(),
            vol_eur : (vol_btc * rate).r2(),
            fee_eur : fee,
            rate    : rate.r2(),
            rest    : 1.0,
        };

        if (pair != 'XXBTZEUR') throw 'TODO: pair not supported: '+pair;
        if (type === "buy")  _S.buys.push(tx);
        if (type === "sell") _S.sells.push(tx);
    });
}

function doWallets(data){
    // read csv
    var csv = $.csv.toArrays(data, {
        delimiter:'"', // sets a custom value delimiter character
        separator:';'  // sets a custom field separator character
    });
    //alert(JSON.stringify(csv));

    // add TX to buys and sells
    $.each(csv, function(index, row){
        if (index == 0) return true; // skip header
        if (row[0].startsWith('#')) return true; // skip comments
        if (row.length == 1 && row[0].trim() == '') return true; // skip empty lines
        if (row.length != 6) throw 'Error: invalid Wallet data at line '+index;
        
        var wallet = {
            pubkey  : row[0],
            type    : row[1],
            subtype : row[2],
            account : row[3],
            wallet  : row[4],
            comment : row[5]
        }

        // TODO: do something
        //if (wallet.type == 'xpub') console.log(wallet, bitcointaxlib.getAddressFromXPub(wallet.pubkey, "0/0"));
        //if (wallet.type == 'xpub') console.log(wallet, bitcointaxlib.getAddressFromXPub(wallet.pubkey, "m/44'/0'/0'/0/0"));
    });
}
function doOtc(data){
    // read csv
    var csv = $.csv.toArrays(data, {
        delimiter:'"', // sets a custom value delimiter character
        separator:';'  // sets a custom field separator character
    });
    //alert(JSON.stringify(csv));

    // add TX to buys and sells
    $.each(csv, function(index, row){
        if (index == 0) return true; // skip header
        if (row[0].startsWith('#')) return true; // skip comments
        if (row.length == 1 && row[0].trim() == '') return true; // skip empty lines
        if (row.length != 7) throw 'Error: invalid OTC data at line '+index;
        
        var date    = new Date(row[0]);
        var vol_btc = Number(row[1]);
        var vol_eur = Number(row[3]);
        var fee_eur = 0;
        var rate    = Number(row[2]);
        if (row[2] === '') rate = btcavgLookup(date);
        // This was a gift/donation
        if (rate === 0) { /* NOOP */ }
        // volume euro was not supplied, calculate it
        if (row[3] === '') vol_eur = rate * vol_btc;

        var sell = vol_btc > 0;
        var buy = vol_btc < 0;

        var tx = {
            source  : 'otc',
            index   : index,
            date    : date,
            ref     : 'otc_'+index,
            vol_btc : vol_btc.r4(),
            vol_eur : vol_eur.r2(),
            fee_eur : fee_eur.r2(),
            rate    : rate.r2(),
            rest    : 1.0,
        };

        if (buy) _S.buys.push(tx);
        if (sell) _S.sells.push(tx);
    });
}

// iterates through buys and sells ordered by their date
function iterateEvents(callback){
    let i = 0; let j = 0;
    let evt = null;
    while (true){
        if (i < _S.buys.length && j < _S.sells.length) {
            if (_S.buys[i].date <= _S.sells[j].date) {
                evt = _S.buys[i++];
                callback(evt, true);
            } else {
                evt = _S.sells[j++];
                callback(evt, false);
            }
        } else if (i < _S.buys.length) {
            evt = _S.buys[i++];
            callback(evt, true);
        } else if (j < _S.sells.length) {
            evt = _S.sells[j++];
            callback(evt, false);
        } else {
            break;
        }
    } 
}

function doMath(){
    // sort buys and sells by date
    _S.buys.sort(function(a, b) { return a.date.getTime() - b.date.getTime(); });
    _S.sells.sort(function(a, b) { return a.date.getTime() - b.date.getTime(); });

    // calculate stake
    let btc = 0.0;
    let eur = 0.0;
    iterateEvents(function(evt, isBuy){
        if (isBuy) {
            btc += evt.vol_btc;
            eur += evt.vol_eur;

            // get invest per year for buys
            let year = evt.date.getFullYear();
            if (!_S.years[year]) newYear(year);
            _S.years[year].invest += evt.vol_eur;
            _S.years.all.invest += evt.vol_eur;
        } else {
            btc -= evt.vol_btc;
            eur -= evt.vol_eur;
        }

        // try to get rate from btcavg or from event as fallback
        let rate;
        try {
            rate = btcavgLookup(evt.date);
        } catch(e) {
            rate = evt.rate
            if (!rate) throw Error('No rate given: '+evt);
        }

        _S.stake.push({
            "evt" : evt,
            "date" : evt.date,
            "rate" : rate,
            "btc" : btc,
            "eur" : rate * btc,
            "avg_eur" : eur / btc,
        });
    });

    // iterate liquidations and do the math
    iterateEvents(function(evt, isBuy){
        if (!isBuy) {
            let sell = evt;
            let year = sell.date.getFullYear();
            if (!_S.years[year]) newYear(year);

            // get fifo settings globally or per year if given
            let _fifo = fifo;
            if ($('#check_fifo_'+year).length === 1){
                if ($('#check_fifo_'+year).prop('checked')) _fifo = true;
                else _fifo = false;
            }

            // get first buy for this liquidation
            let frame;
            if (_fifo) {
                frame = 0;
                while (_S.buys[frame].rest <= 0.0) frame++;
            } else {
                frame = _S.buys.length-1;
                while (_S.buys[frame].date > sell.date) frame--;
            }

            let rest        = sell.vol_btc;
            let bstr        = "";
            let bfee        = 0.0;
            let beur        = 0.0;
            let head        = undefined;
            let first_sell  = undefined;
            let last_sell   = undefined;

            // now sell as much from buy-stack as needed
            while (rest > SATOSHI){ // can't sell sub satoshis :>
                if (frame < 0 || frame >= _S.buys.length) throw "ERROR: nothing to sell - ran out of prior buys";
                head = _S.buys[frame];

                while (head.rest <= 0.0 && frame >= 0 && frame < _S.buys.length) {
                    if (_fifo) frame++;
                    else frame--;
                    if (frame < 0 || frame >= _S.buys.length) throw "ERROR: nothing to sell - ran out of prior buys";
                    head = _S.buys[frame];
                }

                // calc current fraction and rest
                let headRestVol = head.vol_btc*head.rest;
                let fraction = Math.min(rest/headRestVol, 1.0);
                let fractionHead = fraction*head.rest;
                rest -= fraction * headRestVol;
                bstr += head.ref + "*" + fractionHead.r4() + " ";
                bfee += head.fee_eur * fractionHead;
                beur += head.vol_eur * fractionHead;
                head.rest -= fractionHead;

                if (!first_sell) first_sell = head.date
            }
            last_sell = head.date;

            let sfees = bfee + sell.fee_eur;
            let profit = (sell.vol_eur - beur) - sfees;

            // sell events with a defined rate of 0 are gifts or donations per defintion and thus tax free
            if (sell.rate === 0 && profit > 0) profit = 0;

            // germany: coins older than a year are tax free
            // TODO: this can apply to a fraction of a sell
            if (hodl && sell.date - last_sell > YEAR_MILLIS && profit > 0.0) profit = 0;

            // update this sell
            sell.bought_eur = beur.r2();
            sell.profit_eur = profit.r2();
            sell.refs       = bstr;
            sell.first_buy  = first_sell;
            sell.last_buy   = last_sell;
            sell.fee_buy    = bfee.r2();
            sell.rest       = 0.0; // TODO: track BTC values here?

            // update the yearly brackets
            _S.years[year].profit += profit;
            _S.years[year].bought_for += beur;
            _S.years[year].liquidated += sell.vol_eur;
            _S.years[year].fees += sfees;

            _S.years.all.profit += profit;
            _S.years.all.bought_for += beur;
            _S.years.all.liquidated += sell.vol_eur;
            _S.years.all.fees += sfees;
        }

        // stake how many coins are now older than a year on each event
        let btc_1yr = 0.0;
        for (let idx in _S.buys) {
            let buy = _S.buys[idx];
            if (buy.date >= evt.date - YEAR_MILLIS) break;
            if (buy.rest > 0) btc_1yr += buy.rest * buy.vol_btc;
        }
        for (let idx in _S.stake) {
            if (evt == _S.stake[idx].evt) {
                _S.stake[idx].btc_1yr = btc_1yr;
                _S.stake[idx].eur_1yr = _S.stake[idx].rate * btc_1yr;
                // 'fix' logscale rendering problems of 0 'zero' stakes
                if (_S.stake[idx].eur_1yr === 0) _S.stake[idx].eur_1yr = 10;
                break;
            }
        }
    });
}

function drawCharts(){
    $('#charts').empty();
    google.charts.load('current', {'packages':['corechart','bar']});
    charts = [];

    google.charts.setOnLoadCallback(function() {

        var raw = [['Year', 'Invest EUR', 'Liquidate EUR', 'Profit EUR']];
        for (idx in _S.years) {
            if (idx === 'all') continue;
            var y = _S.years[idx];
            raw.push([idx, y.invest, y.liquidated, y.profit])
        }
        charts.push({
            raw : raw,
            data : google.visualization.arrayToDataTable(raw),
            options : {
                title: 'Performance',
                bars: 'horizontal'
            }
        });

        raw = [['Date', 'BTC', 'BTC >1yr']];
        for (idx in _S.stake) raw.push([_S.stake[idx].date, _S.stake[idx].btc, _S.stake[idx].btc_1yr]);
        charts.push({
            raw : raw,
            data : google.visualization.arrayToDataTable(raw),
            options : {
                title: 'Stake BTC',
                hAxis: {title: 'Date',  titleTextStyle: {color: '#333'}}
            }
        });

        raw = [['Date', 'EUR', 'EUR >1yr']];
        for (idx in _S.stake) raw.push([_S.stake[idx].date, _S.stake[idx].eur, _S.stake[idx].eur_1yr]);
        charts.push({
            raw : raw,
            data : google.visualization.arrayToDataTable(raw),
            options : {
                title: 'Value EUR',
                hAxis: {title: 'Date',  titleTextStyle: {color: '#333'}}
            }
        });
        charts.push({
            raw : raw,
            data : google.visualization.arrayToDataTable(raw),
            options : {
                title: 'Value EUR (log scale)',
                hAxis: {title: 'Date',  titleTextStyle: {color: '#333'}},
                vAxis: { minValue:0, viewWindow: { min: 1000 }, scaleType: 'log' }
            }
        });

        raw = [['Date', 'EUR']];
        for (idx in _S.stake) raw.push([_S.stake[idx].date, _S.stake[idx].avg_eur]);
        charts.push({
            raw : raw,
            data : google.visualization.arrayToDataTable(raw),
            options : {
                title: 'Average rate: EUR per BTC',
                hAxis: {title: 'Date',  titleTextStyle: {color: '#333'}}
            }
        });

        // render all charts
        for (i in charts) {
            $('#charts').append('<div id="chart_'+i+'"/>');
            var chart = $('#chart_'+i)[0];

            if (charts[i].options["bars"]){
                chart = new google.charts.Bar(chart);
                chart.draw(charts[i].data, google.charts.Bar.convertOptions(charts[i].options));
            }else{
                chart = new google.visualization.AreaChart(chart);
                chart.draw(charts[i].data, charts[i].options);
            }
        }
    });
}

function printResults(){
    // output liquidation result
    var csvout = [];
    var headers = $('<div id="srow_h" class="row" />');
    csvout[0] = [];
    $.each(_S.sells[0], function(k,v){ 
        csvout[0].push(k);
        headers.append('<div class="cell header">'+k+'</div>');
    });
    $('#sells').append(headers);

    $.each(_S.sells, function(index, sell){
        csvout[index+1] = [];
        $('#sells').append('<div id="srow_'+index+'" class="row" />');
        $.each(sell, function(k,v){
            if (v instanceof Date) v = v.toISOString().substr(0,10);
            csvout[index+1].push(v);
            $('#srow_'+index).append('<div id="csv_'+k+'" class="cell">'+v+'</div>');
        });
    });

    // output csv
    var output = $('<textarea class="output" id="csv" rows="10" cols="200"></textarea>');
    $.each(csvout, function(k,v){ csvout[k] = csvout[k].join(';'); });
    output.val(csvout.join('\n'));
    $('#history').append(output);

    drawCharts();
}


//
// TESTS performed each time
//
function test(){
    cleanup();
    let fails = 0;
    function assert(condition, message){
        if (!condition){
            fails++;
            console.error(message);
        }
    }

    doBitcoinDe(';;;;;;;;;;\n' +
`"2015-01-05 10:19:02";Kauf;"BTC / EUR";REF01;239.88;1.50000000;359.82;1.48500000;358.02;1.48500000;0.0
"2015-01-05 22:55:36";Auszahlung;;298d8ef7a...;;;;;;0.0;0.0
"2015-01-06 11:23:03";Kauf;"BTC / EUR";REF02;227.00;0.50000000;113.50;0.49500000;112.93;0.49500000;0.0
"2015-01-07 23:56:01";Verkauf;"BTC / EUR";REF03;244.59;0.50000000;122.29;0.49500000;121.68;-0.50000000;0.0`);
    
    assert(_S.buys.length === 2, 'invalid number of buys');
    assert(_S.sells.length === 1, 'invalid number of sells');
    assert(Object.keys(_S.buys[0]).length === 9, 'invalid number of buy properties');
    assert(Object.keys(_S.sells[0]).length === 9, 'invalid number of sell properties');

    assert(_S.buys[0].date.getTime() === 1420449542000);
    assert(_S.buys[0].source === 'btcde');
    assert(_S.buys[0].index === 1);
    assert(_S.buys[0].ref === 'REF01');
    assert(_S.buys[0].vol_btc === 1.485);
    assert(_S.buys[0].vol_eur === 358.02); // note: without fees
    assert(_S.buys[0].fee_eur === 1.8);
    assert(_S.buys[0].rate === 241.09); // note: rate is also without fees.
    assert(_S.buys[0].rest === 1);

    assert(_S.sells[0].date.getTime() === 1420671361000);
    assert(_S.sells[0].source === 'btcde');
    assert(_S.sells[0].index === 4);
    assert(_S.sells[0].ref === 'REF03');
    assert(_S.sells[0].vol_btc === 0.495);
    assert(_S.sells[0].vol_eur === 121.68);
    assert(_S.sells[0].fee_eur === 0.61);
    assert(_S.sells[0].rate === 245.82);
    assert(_S.sells[0].rest === 1);
    assert(_S.sells[0].index === 4);


    // simple fifo rest check
    cleanup();
    doBitcoinDe(';;;;;;;;;;\n' +
`"2015-01-01 01:00:00";Kauf;"BTC / EUR";   1;100;0.5;50 ;0.5;50 ; 0.5;0
"2015-01-02 02:00:00";Kauf;"BTC / EUR";    2;200;0.5;100;0.5;100; 0.5;0
"2015-01-03 03:00:00";Verkauf;"BTC / EUR"; 3;300;0.7;210;0.7;210;-0.7;0`);
    doMath();
    assert(_S.buys[0].rest === 0,        'fifo should sell first first');
    assert(_S.buys[1].rest.r4() === 0.6, 'wrong fraction remaining');
    assert(_S.sells[0].rest === 0,       'did no sell all');

    assert(_S.years['2015'].invest === 150,     'wrong invested euro');
    assert(_S.years['2015'].liquidated === 210, 'wrong liquidated euro');
    assert(_S.years['2015'].bought_for === 90,  'wrong bought for');
    assert(_S.years['2015'].profit === 120,     'wrong profit');

    assert(_S.stake[2].btc.r4() === 0.3, 'wrong remaining btc stake');
    assert(_S.stake[2].avg_eur.r4() === -200, 'wrong avg_eur stake');

    // simple lifo rest check and wrong order
    cleanup();
    fifo = false;
    doBitcoinDe(';;;;;;;;;;\n' +
`"2015-01-03 03:00:00";Verkauf;"BTC / EUR"; 3;300;0.7;210;0.7;210;-0.7;0
"2015-01-02 02:00:00";Kauf;"BTC / EUR";     2;200;0.5;100;0.5;100; 0.5;0
"2015-01-01 01:00:00";Kauf;"BTC / EUR";     1;100;0.5;50 ;0.5;50 ; 0.5;0`);
    doMath();
    assert(_S.buys[0].rest.r4() === 0.6, 'wrong fraction remaining');
    assert(_S.buys[1].rest === 0,        'lifo should sell last first');
    assert(_S.sells[0].rest === 0,       'did no sell all');

    assert(_S.years['2015'].invest === 150,     'wrong invested euro');
    assert(_S.years['2015'].liquidated === 210, 'wrong liquidated euro');
    assert(_S.years['2015'].bought_for === 120, 'wrong bought for');
    assert(_S.years['2015'].profit === 90,      'wrong profit');

    assert(_S.stake[2].btc.r4() === 0.3, 'wrong remaining btc stake');
    assert(_S.stake[2].avg_eur.r4() === -200, 'wrong avg_eur stake');

    // test sell more than bought fails
    cleanup();
    doBitcoinDe(';;;;;;;;;;\n' +
`"2015-01-01 01:00:00";Kauf;"BTC / EUR";   1;100;0.5;50 ;0.5;50 ; 0.5;0
"2015-01-02 02:00:00";Kauf;"BTC / EUR";    2;200;0.5;100;0.5;100; 0.5;0
"2015-01-03 03:00:00";Verkauf;"BTC / EUR"; 3;300;1.5;450;1.5;450;-1.5;0`);
    try {
        doMath();
    } catch (e) {
        assert(e.indexOf('nothing to sell') >= 0);
    }

    // test with sell rate of 0 (donation)
    cleanup();
    doBitcoinDe(';;;;;;;;;;\n' +
`"2015-01-01 01:00:00";Kauf;"BTC / EUR";   1;100;0.5;50 ;0.5;50 ; 0.5;0
"2015-01-02 02:00:00";Kauf;"BTC / EUR";    2;200;0.5;100;0.5;100; 0.5;0
"2015-01-03 03:00:00";Verkauf;"BTC / EUR"; 3;0;0.7;0;0.7;0;-0.7;0`);
    doMath();
    assert(_S.sells[0].profit_eur === -90);
    assert(_S.stake[2].btc.r4() === 0.3);
    assert(_S.years['2015'].profit === -90);
    assert(_S.years['all'].profit === -90);

    // TODO: trace profits and taxable profits separately
    // TODO: check avg_eur per btc maybe calculated incorrectly
    // TODO: test for fee calculation
    // TODO: moar tests
    // replace $.each with proper looping when not gui related


    if (fails > 0) alert('There were unit tests failures, check console!');
    else console.log('Unit tests passed.');
}


// test and init
function doIt(){
    cleanup();
    processInput();
    doMath();
    printResults();
}
loadBtcAvg();
test();
cleanup();
