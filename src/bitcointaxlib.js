let bitcoinjs = require('bitcoinjs-lib');
let jayson = require('jayson');

const ELECTRUM_HOST = 'electrumx.schmoock.net';
const ELECTRUM_PORT = 50001;
let   ELECTRUM_CLIENTS = {};

// Returns an electrum client having set the a protocol version.
// arg1 - version string - default '1.4'
async function getElectrumClient(version){
    if (!version) version = "1.4";
    if (ELECTRUM_CLIENTS[version]) return ELECTRUM_CLIENTS[version];

    ELECTRUM_CLIENTS[version] = new Promise(async function(resolve, reject){
        let client = jayson.client.tcp({
            host : ELECTRUM_HOST,
            port : ELECTRUM_PORT
        });

        client.request('server.version', ["bitcointaxlib 0.6", version], function(err, result) {
            if(err) reject(err);
            // console.log(result.result[0]); // server version string
            resolve(client);
        });
    });

    return await ELECTRUM_CLIENTS[version];
}

// Returns the transaction IDs for a given locking script.
// arg1 - the serialized script in HEX String or Byte Buffer format. All OpCodes and data.
// example - lib.getHistoryFromScript('0014153d7a46a3f00abb8e6188ba3a8f4755d84ca912')
async function getHistoryFromScript(script) {
    if (typeof(script) === 'string') script = Buffer.from(script, "hex");
    let hash = bitcoinjs.crypto.sha256(script);
    hash.reverse();
    let hex = hash.toString('hex');

    let client = await getElectrumClient();
    return new Promise(function(resolve, reject){
        client.request('blockchain.scripthash.get_history', [hex], function(err, result) {
            if(err) reject(err);
            resolve(result.result);
        });
    });
}

async function getTransaction(tx_hash_hex) {
    let client = await getElectrumClient();
    return new Promise(function(resolve, reject){
        client.request('blockchain.transaction.get', {
                tx_hash : tx_hash_hex,
                verbose: true
            }, function(err, result) {

            if(err) reject(err);
            resolve(result.result);
        });
    });
}

// Returns the history for a pubkey using p2pk, p2pkh, p2wsh, p2wpkh script types.
// arg1
//  * p2pk  030e7061b9fb18571cf2441b2a7ee2419933ddaa423bc178672cd11e87911616d1 
//  * p2pkh 0250863ad64a87ae8a2fe83c1af1a8403cb53f53e486d8511dad8a04887e5b2352
async function getHistoryFromPubkey(pubkey_hex) {
    let pubkey = Buffer.from(pubkey_hex, "hex");
    let pubkey_hash = bitcoinjs.crypto.ripemd160(bitcoinjs.crypto.sha256(pubkey));
    let pubkey_hash_hex = pubkey_hash.toString('hex');

    let p2pk = bitcoinjs.payments.p2pk({ pubkey });
    let p2pkh = bitcoinjs.payments.p2pkh({ pubkey });
    let p2wpkh = bitcoinjs.payments.p2wpkh({ pubkey });
    let p2wsh = bitcoinjs.payments.p2sh({ redeem: p2wpkh });

    let script_p2pk = p2pk.output;
    // P2PKH        OP_DUP OP_HASH160 <PUBKEY> OP_EQUALVERIFY OP_CHECKSIG
    let script_p2pkh = p2pkh.output; // '76a914' + pubkey_hash_hex + '88ac';
    // P2WPKH_P2SH  OP_HASH160 <WSHASH> OPS.OP_EQUAL  // 'a914' + wsh_hex + '87';
    let script_p2wsh = p2wsh.output; //.toString('hex');
    let script_p2wpkh = p2wpkh.output; //.toString('hex');

    let ppk = getHistoryFromScript(script_p2pk);
    let p44 = getHistoryFromScript(script_p2pkh);
    let p49 = getHistoryFromScript(script_p2wsh);
    let p84 = getHistoryFromScript(script_p2wpkh);

    return Promise.all([ppk, p44, p49, p84]).then(function(res){
        return {
            'p2pk' : res[0],
            'p2pkh' : res[1],
            'p2wsh' : res[2],
            'p2wpkh' : res[3],
            'all' : [].concat.apply([], res)
        };
    });
}

function getAddressFromXPub(xpub, path, segwit) {
    var node = bitcoinjs.bip32.fromBase58(xpub);
    var child = node.derivePath(path);

    if (segwit) {
        var keyhash = bitcoinjs.crypto.hash160(child.getPublicKeyBuffer())
        var scriptSig = bitcoinjs.script.witnessPubKeyHash.output.encode(keyhash)
        var addressBytes = bitcoinjs.crypto.hash160(scriptSig)
        var outputScript = bitcoinjs.script.scriptHash.output.encode(addressBytes)
        var address = bitcoinjs.address.fromOutputScript(outputScript, bitcoinjs.networks.mainnet)
        return address;
    }

    return child.getAddress();
}

module.exports = {
    getElectrumClient,
    getAddressFromXPub,
    getHistoryFromScript,
    getHistoryFromPubkey,
    getTransaction
}
