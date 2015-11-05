var async = require('async')
var assert = require('assert')
var _ = require('lodash')
var ipfs = require('ipfs-api')()
var hcset = require('./index.js')(ipfs)

var elements = []
var count = 100
var timeout = 20000
var numVariations = 4

for (var i = 0 ; i < count ; i++) {
  elements.push({id: i})
}

var variations = []
for (var i = 0 ; i < numVariations ; i++) {
  variations.push(_.shuffle(elements))
}

var add_many = function (set, values, cb) {
  async.reduce(values, set, function (memo, item, cb) {
    memo.add(item, cb)
  }, cb)
}

it('should add many', function (done) {
  this.timeout(timeout)
  add_many(hcset.empty(), elements, function (err, res) {
    if (err) throw err
    async.map(_.range(count), function (idx, cb) {
      res.get({ id: idx }, function (err, res) {
        if (err) throw err
        assert.deepEqual(res, { id: idx })
        cb()
      })
    }, function (err) {
      if (err) throw err
      done()
    })
  })
})

describe('removal', function () {
  it('should remove one element', function (done) {
    var toRemove = Math.floor(count / 3)
    add_many(hcset.empty(), elements, function (err, res) {
      if (err) throw err
      res.remove({ id: toRemove }, function (err, res) {
        if (err) throw err
        async.map(_.range(count), function (idx, cb) {
          res.get({ id: idx }, function (err, res) {
            if (err) throw err
            if (idx === toRemove) {
              assert.equal(res, undefined)
            } else {
              assert.deepEqual(res, { id: idx })
            }
            cb()
          })
        }, function (err, res) {
          if (err) throw err
          done()
        })
      })
    })
  })

  it('should remove all even elements', function (done) {
    var toRemove = Math.floor(count / 3)
    add_many(hcset.empty(), elements, function (err, res) {
      if (err) throw err

      async.reduce(_.range(0, count, 2), res, function (memo, ridx, cb) {
        memo.remove({ id: ridx }, cb)
      }, function (err, res) {
        if (err) throw err

        async.map(_.range(count), function (idx, cb) {
          res.get({ id: idx }, function (err, res) {
            if (err) throw err
            if (idx % 2 == 0) {
              assert.equal(res, undefined)
            } else {
              assert.deepEqual(res, { id: idx })
            }
            cb()
          })
        }, function (err, res) {
          if (err) throw err
          done()
        })
      })
    })
  })
})

describe('commutivity', function () {
  it('should add up to same datastructure in any order', function (done) {
    this.timeout(timeout)

    async.map(variations, function (variation, cb) {
      add_many(hcset.empty(), variation, cb)
    }, function (err, res) {

      var compare = res[0]
      for (var i = 1 ; i < res.length ; i++) {
        assert.deepEqual(compare, res[i])
      }
      done()
    })
  })
})

describe('persistance', function () {
  it('should persist and restore', function (done) {
    this.timeout(timeout)
    add_many(hcset.empty(), elements, function (err, res) {
      if (err) throw err
      res.persist(function (err, res) {
        if (err) throw err

        var doc = hcset.restore(res.persisted.Hash)

        async.map(_.range(count), function (idx, cb) {
          doc.get({ id: idx }, function (err, res) {
            if (err) throw err
            assert.deepEqual(res, { id: idx })
            cb()
          })
        }, function (err) {
          if (err) throw err
          done()
        })
      })
    })
  })

  it('should persist variations to same hash', function (done) {
    this.timeout(timeout)

    async.map(variations, function (variation, cb) {
      add_many(hcset.empty(), variation, function (err, res) {
        if (err) throw err
        res.persist(function (err, res) {
          if (err) throw err
          cb(null, res.persisted)
        })
      })
    }, function (err, res) {
      if (err) throw err

      var compare = res[0]
      for (var i = 1 ; i < res.length ; i++) {
        assert.deepEqual(compare, res[i])
      }
      done()
    })
  })
})
