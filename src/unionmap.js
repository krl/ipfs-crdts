var u = require('./util.js')

module.exports = function (ipo) {
  var HAMT = require('./hamt.js')(ipo)
  var HotSet = require('./hotset.js')(ipo)

  var UnionMap = ipo.obj(__filename, function (map) {
    this.data = {map: map || new HAMT()}
  })

  UnionMap.prototype.initMeta = function () {
    return this.data.map.meta
  }

  UnionMap.prototype.get = function (key, cb) {
    this.data.map.get(u.digest(key), 0, function (err, res) {
      if (err) return cb(err)
      if (!res) return cb(null, new HotSet())
      cb(null, res)
    })
  }

  UnionMap.prototype.add = function (key, el, cb) {
    var self = this
    var set = new HotSet()

    set.add(el, function (err, res) {
      if (err) return cb(err)

      var hash = u.digest(key)
      var idx = u.index(hash, 0)
      var data = {}
      data[idx] = { el: res, hash: hash }

      self.union(new UnionMap(new HAMT(data)), function (err, res) {
        cb(err, res)
      })
    })
  }

  UnionMap.prototype.remove = function (key, el, cb) {
    var self = this
    var set = new HotSet()

    set.remove(el, function (err, res) {
      if (err) return cb(err)

      var hash = u.digest(key)
      var idx = u.index(hash, 0)
      var data = {}
      data[idx] = { el: res, hash: hash }

      self.union(new UnionMap(new HAMT(data)), function (err, res) {
        cb(err, res)
      })
    })
  }

  UnionMap.prototype.union = function (other, cb) {
    this.data.map.union(other.data.map, 0, function (err, res) {
      if (err) return cb(err)
      cb(null, new UnionMap(res))
    })
  }

  return UnionMap
}
