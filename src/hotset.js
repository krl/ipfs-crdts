var u = require('./util.js')

module.exports = function (ipo) {
  var HAMT = require('./hamt.js')(ipo)

  var HotSet = ipo.obj(__filename, function (hot, cold) {
    this.data = {}
    if (hot) {
      this.data.hot = hot
    }
    if (cold) {
      this.data.cold = cold
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
    var toAdd = new HAMT(data)

    if (self.data.hot) {
      self.call('hot', 'union', toAdd, 0, function (err, newHot) {
        if (err) return cb(err)
        if (self.data.cold) {
          self.call('hot', 'notIn', 0, self.data.cold, function (err, res) {
            if (err) return cb(err)
            cb(null, new HotSet(res, self.data.cold))
          })
        } else {
          cb(null, new HotSet(newHot))
        }
      })
    } else {
      cb(null, new HotSet(toAdd))
    }
  }

  HotSet.prototype.remove = function (el, cb) {
    var self = this
    var hash = u.digest(el)
    var idx = u.index(hash, 0)

    if (!self.data.cold) self.data.cold = new HAMT()

    var data = {}
    data[idx] = { el: el,
                  hash: hash }
    var coldAdd = new HAMT(data)

    self.call('cold', 'union', coldAdd, 0, function (err, newCold) {
      if (err) return cb(err)

      self.call('hot', 'notIn', newCold, 0, function (err, newHot) {
        if (err) return cb(err)

        cb(null, new HotSet(newHot, newCold))
      })
    })
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
    if (this.data.hot) {
      this.call('hot', 'union', set.data.hot, 0, function (err, res) {
        if (err) return cb(err)
        cb(null, new HotSet(res))
      })
    } else {
      cb(null, set)
    }
  }

  HotSet.prototype.notIn = function (set, cb) {
    if (this.data.hot) {
      this.call('hot', 'notIn', set.data.hot, 0, function (err, res) {
        if (err) return cb(err)
        cb(null, new HotSet(res))
      })
    } else {
      cb(null, set)
    }
  }

  return HotSet
}
