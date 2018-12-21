let bitcoinjs = require('bitcoinjs-lib');
let jayson = require('jayson');

const ELECTRUM_HOST = 'electrumx.schmoock.net';
const ELECTRUM_PORT = 50001;

// Returns an electrum client having set the a protocol version.
// arg1 - version string - default '1.4'
async function getElectrumClient(version){
    if (!version) version = "1.4";
    let client = jayson.client.tcp({
        host : ELECTRUM_HOST,
        port : ELECTRUM_PORT
    });

    return new Promise(function(resolve, reject){
        client.request('server.version', ["bitcointaxlib 0.6", version], function(err, result) {
            if(err) reject(err);
            // console.log(result.result[0]); // server version string
            resolve(client);
        });
    });
}

// Returns the transaction IDs for a given locking script.
// arg1 - the serialized script in HEX format. All OpCodes and data.
// example - lib.getHistoryFromScript('0014153d7a46a3f00abb8e6188ba3a8f4755d84ca912')
async function getHistoryFromScript(scripthex) {
    let buf = Buffer.from(scripthex, "hex");
    let hash = bitcoinjs.crypto.sha256(buf);
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

// Returns the history for BIP44/49/84 addresses of a pubkey
// arg1 - i.e. 0250863ad64a87ae8a2fe83c1af1a8403cb53f53e486d8511dad8a04887e5b2352
async function getHistoryFromPubkey(pubkey_hex) {
    let pubkey = Buffer.from(pubkey_hex, "hex");
    let pubkey_hash = bitcoinjs.crypto.ripemd160(bitcoinjs.crypto.sha256(pubkey));
    let pubkey_hash_hex = pubkey_hash.toString('hex');

    // P2PKH    OP_DUP OP_HASH160 <PUBKEY> OP_EQUALVERIFY OP_CHECKSIG
    let script_44 = '76a914' + pubkey_hash_hex + '88ac';
    let script_49 = '';
    let script_84 = '';

    let p44 = getHistoryFromScript(script_44);
    let p49 = getHistoryFromScript(script_49);
    let p84 = getHistoryFromScript(script_84);

    return Promise.all([p44, p49, p84]).then(function(h44, h49, h84){
        return h44.concat(h49).concat(h84);
    });
}

function getAddressFromXPub(xpub, path, segwit) {
    var node = bitcoinjs.HDNode.fromBase58(xpub);
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
    getHistoryFromPubkey
}
