var u = require('./util.js')
var async = require('async')

module.exports = function (ipo) {
  var HAMT = require('./hamt.js')(ipo)

  var HotSet = ipo.obj(__filename, function (hot, cold) {
    this.data = {
      hot: hot || new HAMT(),
      cold: cold || new HAMT()
    }
  })

  HotSet.prototype.initMeta = function () {
    if (this.data.hot) {
      return this.data.hot.meta
    } else {
      return { count: 0, id: u.empty }
    }
  }

  HotSet.prototype.add = function (el, cb) {
    var self = this
    var hash = u.digest(el)
    var idx = u.index(hash, 0)
    var data = {}
    data[idx] = { el: el,
                  hash: hash }

    self.union(new HotSet(new HAMT(data)), cb)
  }

  HotSet.prototype.remove = function (el, cb) {
    var self = this
    var hash = u.digest(el)
    var idx = u.index(hash, 0)

    if (!self.data.cold) self.data.cold = new HAMT()

    var data = {}
    data[idx] = { el: el, hash: hash }

    self.union(new HotSet(null, new HAMT(data)), cb)
  }

  HotSet.prototype.get = function (el, cb) {
    if (this.data.hot) {
      var hash = u.digest(el)
      this.call('hot', 'get', hash, 0, cb)
    } else {
      cb(null)
    }
  }

  HotSet.prototype.all = function (cb) {
    this.call('hot', 'all', cb)
  }

  HotSet.prototype.union = function (set, cb) {
    var self = this

    async.parallel([
      function (cb) { self.call('hot', 'union', set.data.hot, 0, cb) },
      function (cb) { self.call('cold', 'union', set.data.cold, 0, cb) }
    ], function (err, res) {
      if (err) return cb(err)
      var hot = res[0]
      var cold = res[1]

      hot.notIn(cold, 0, function (err, remainder) {
        if (err) return cb(err)
        cb(null, new HotSet(remainder, cold))
      })
    })
  }

  HotSet.prototype.notIn = function (set, cb) {
    this.call('hot', 'notIn', set.data.hot, 0, function (err, res) {
      if (err) return cb(err)
      cb(null, new HotSet(res))
    })
  }

  return HotSet
}
