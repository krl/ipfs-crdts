var u = require('./util.js')

module.exports = function (ipo) {
  var HAMT = require('./hamt.js')(ipo)

  var UnionMap = ipo.obj(__filename, function (map) {
    this.data = {map: map || new HAMT()}
  })

  UnionMap.prototype.initMeta = function () {
    return this.data.map.meta
  }

  UnionMap.prototype.get = function (key, cb) {
    this.data.map.get(u.digest(key), 0, cb)
  }

  UnionMap.prototype.add = function (key, el, cb) {
    var self = this
    var hash = u.digest(key)
    var idx = u.index(hash, 0)
    var data = {}
    data[idx] = { el: el, hash: hash }

    self.union(new UnionMap(new HAMT(data)), cb)
  }

  UnionMap.prototype.union = function (other, cb) {
    this.data.map.union(other.data.map, 0, function (err, res) {
      if (err) return cb(err)
      cb(null, new UnionMap(res))
    })
  }

  return UnionMap
}
