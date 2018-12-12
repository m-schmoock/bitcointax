let bitcoinjs = require('bitcoinjs-lib')

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
    getAddressFromXPub : getAddressFromXPub,
}
