var u = require('./util.js')
var _ = require('lodash')
var async = require('async')

module.exports = function (ipo) {
  var HAMT = ipo.obj(__filename, function (data) {
    this.data = data
  })

  HAMT.prototype.initMeta = function () {
    return {
      id: u.xorStrings(_.map(this.data, function (x) {
        if (x.hash) return x.hash
        return x.meta.id
      })),
      count: _.reduce(_.map(this.data, function (a) {
        if (a.meta) return a.meta.count
        return 1
      }), function (a, b) { return a + b }) || 0
    }
  }

  HAMT.prototype.all = function (cb) {
    var res = []
    for (var i = 0; i < u.branching; i++) {
      if (this.data[i]) res.push(this.data[i].el)
    }
    cb(null, res)
  }

  HAMT.prototype.get = function (hash, depth, cb) {
    var idx = u.index(hash, depth)
    var child = this.data[idx]
    if (child) {
      if (child.hash) {
        if (child.hash === hash) {
          cb(null, this.data[idx].el)
        } else {
          cb(null)
        }
      } else if (child) {
        this.call(idx, 'get', hash, depth + 1, cb)
      }
    } else {
      cb(null)
    }
  }

  HAMT.prototype.union = function (tounion, depth, cb) {
    var self = this

    // tounion might be a ref.
    tounion.load(function (err, tounion) {
      if (err) return cb(err)

      async.map(_.range(u.branching), function (i, mapcb) {
        var a = self.data[i]
        var b = tounion.data[i]

        var dataA, dataB, hamtA, hamtB

        if (a) {
          if (b) {
            if (a.hash && b.hash) {
              if (a.hash === b.hash) {
                mapcb(null, a)
              } else {
                dataA = {}
                dataB = {}
                dataA[u.index(a.hash, depth + 1)] = a
                dataB[u.index(b.hash, depth + 1)] = b
                hamtA = new HAMT(dataA)
                hamtB = new HAMT(dataB)
                hamtA.union(hamtB, depth + 1, function (err, res) {
                  if (err) return cb(err)
                  mapcb(null, res)
                })
              }
            } else if (a.hash) {
              dataA = {}
              dataA[u.index(a.hash, depth + 1)] = a
              hamtA = new HAMT(dataA)
              tounion.call(i, 'union', hamtA, depth + 1, function (err, res) {
                if (err) return cb(err)
                mapcb(null, res)
              })
            } else if (b.hash) {
              dataB = {}
              dataB[u.index(b.hash, depth + 1)] = b
              hamtB = new HAMT(dataB)
              self.call(i, 'union', hamtB, depth + 1, function (err, res) {
                if (err) return cb(err)
                mapcb(null, res)
              })
            } else {
              // two hamts
              if (a.meta.id === b.meta.id) {
                mapcb(null, a)
              } else {
                self.call(i, 'union', b, depth + 1, function (err, res) {
                  if (err) return cb(err)
                  mapcb(null, res)
                })
              }
            }
          } else {
            mapcb(null, a)
          }
        } else if (b) {
          mapcb(null, b)
        } else {
          mapcb(null)
        }
      }, function (err, res) {
        if (err) return cb(err)
        var data = {}

        for (var i = 0; i < u.branching; i++) {
          if (res[i]) {
            data[i] = res[i]
          }
        }
        cb(null, new HAMT(data))
      })
    })
  }

  HAMT.prototype.notIn = function (other, depth, cb) {
    var self = this

    // other might be a ref.
    other.load(function (err, other) {
      if (err) return cb(err)

      async.map(_.range(u.branching), function (i, mapcb) {
        var a = self.data[i]
        var b = other.data[i]

        var dataB, hamtB

        if (a) {
          if (b) {
            if (a.hash && b.hash) {
              if (a.hash === b.hash) {
                mapcb(null)
              } else {
                mapcb(null, a)
              }
            } else if (a.hash) {
              // a is item
              // return it if it's not in b
              b.get(a.hash, depth + 1, function (err, res) {
                if (err) return cb(err)
                if (res) {
                  mapcb(null)
                } else {
                  mapcb(null, a)
                }
              })
            } else if (b.hash) {
              // b is an item
              // return a without item b
              dataB = {}
              dataB[u.index(b.hash, depth + 1)] = b
              hamtB = new HAMT(dataB)

              self.call(i, 'notIn', hamtB, depth + 1, function (err, res) {
                if (err) return cb(err)
                mapcb(null, res)
              })
            } else {
              // two hamts
              if (a.meta.id === b.meta.id) {
                mapcb(null)
              } else {
                self.call(i, 'notIn', b, depth + 1, function (err, res) {
                  if (err) return cb(err)
                  mapcb(null, res)
                })
              }
            }
          } else {
            mapcb(null, a)
          }
        } else {
          mapcb(null)
        }
      }, function (err, res) {
        if (err) return cb(err)
        var data = {}

        for (var i = 0; i < u.branching; i++) {
          if (res[i]) {
            if (res[i].meta && res[i].meta.count === 1) {
              // collapse one-element hamts
              data[i] = _.values(res[i].data)[0]
            } else {
              data[i] = res[i]
            }
          }
        }
        cb(null, new HAMT(data))
      })
    })
  }

  return HAMT
}
