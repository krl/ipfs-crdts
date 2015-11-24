var B2 = require('blake2s')
var stringify = require('json-stable-stringify')
var _ = require('lodash')

var BRANCHING = 32
var HASHBYTES = 32

var empty = new Array(HASHBYTES * 2 + 1).join('0')

module.exports = {
  branching: BRANCHING,
  empty: empty,
  index: function (hash, depth) {
    // we want the keys to sort lowest-hash first
    // so we use two hex chars, then divide them
    // so they fit inside BRANCHING
    var by = parseInt(hash.substr(depth * 2, 2), 16)
    return Math.floor(by / (265 / BRANCHING))
  },
  digest: function (value) {
    var hasher = new B2(HASHBYTES)
    hasher.update(stringify(value))
    return hasher.digest('hex')
  },
  xorStrings: function (strings) {
    if (strings.length === 0) {
      return empty
    } else if (strings.length === 1) {
      return strings[0]
    }

    var bufs = _.map(strings, function (s) {
      return new Buffer(s, 'hex')
    })

    for (var i = 1; i < bufs.length ; i++) {
      for (var b = 0 ; b < HASHBYTES ; b++) {
        bufs[0][b] = bufs[0][b] ^ bufs[i][b]
      }
    }
    return bufs[0].toString('hex')
  }
}
