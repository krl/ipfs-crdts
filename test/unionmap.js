var async = require('async')
var assert = require('assert')
var ipfs = require('ipfs-api')('localhost', 5001)
var ipo = require('ipfs-obj')(ipfs)

var UnionMap = require('../src/unionmap.js')(ipo)

/* global describe, it */

describe('UnionMap', function () {
  describe('basic', function () {
    it('should map foo to a set containing bar', function (done) {
      var map = new UnionMap()

      map.add('foo', 'bar', function (err, res) {
        if (err) throw err
        res.get('foo', function (err, gottenset) {
          if (err) throw err
          gottenset.get('bar', function (err, res) {
            if (err) throw err
            assert.equal(res, 'bar')
            done()
          })
        })
      })
    })

    it('should get empty set on non-existing key', function (done) {
      var map = new UnionMap()

      map.get('foo', function (err, gottenset) {
        if (err) throw err
        assert.equal(gottenset.meta.count, 0)
        done()
      })
    })

    it('should merge un-overlapping maps', function (done) {
      var map = new UnionMap()

      async.parallel([
        function (cb) { map.add('foo', 'bar', cb) },
        function (cb) { map.add('baz', 'bar', cb) }
      ], function (err, res) {
        if (err) throw err

        res[0].union(res[1], function (err, res) {
          if (err) throw err

          async.parallel([
            function (cb) { res.get('foo', cb) },
            function (cb) { res.get('baz', cb) }
          ], function (err, res) {
            if (err) throw err
            async.parallel([
              function (cb) { res[0].get('bar', cb) },
              function (cb) { res[1].get('bar', cb) }
            ], function (err, res) {
              if (err) throw err
              assert.equal(res[0], res[1])
              assert.equal(res[0], 'bar')
              done()
            })
          })
        })
      })
    })

    it('should merge overlapping keys', function (done) {
      var map = new UnionMap()

      async.parallel([
        function (cb) { map.add('foo', 'bar', cb) },
        function (cb) { map.add('foo', 'baz', cb) }
      ], function (err, res) {
        if (err) throw err

        res[0].union(res[1], function (err, res) {
          if (err) throw err

          res.get('foo', function (err, res) {
            if (err) throw err

            async.parallel([
              function (cb) { res.get('bar', cb) },
              function (cb) { res.get('baz', cb) }
            ], function (err, res) {
              if (err) throw err
              assert.equal(res[0], 'bar')
              assert.equal(res[1], 'baz')
              done()
            })
          })
        })
      })
    })

    it('should merge overlapping values', function (done) {
      var map1 = new UnionMap()

      async.parallel([
        function (cb) { map1.add('foo', 'baz', cb) },
        function (cb) { map1.add('bar', 'baz', cb) }
      ], function (err, res) {
        if (err) throw err

        res[0].union(res[1], function (err, res) {
          if (err) throw err

          async.parallel([
            function (cb) {
              res.get('foo', function (err, res) {
                if (err) throw err
                res.all(cb)
              })
            },
            function (cb) {
              res.get('bar', function (err, res) {
                if (err) throw err
                res.all(cb)
              })
            }
          ], function (err, res) {
            if (err) throw err
            assert.equal(res[0][0], 'baz')
            assert.equal(res[1][0], 'baz')
            done()
          })
        })
      })
    })
  })

  describe('basic', function () {
    it('should remove values from keys', function (done) {
      var map = new UnionMap()

      map.add('foo', 'bar', function (err, res) {
        if (err) throw err
        res.remove('foo', 'bar', function (err, res) {
          if (err) throw err
          res.get('foo', function (err, gottenset) {
            if (err) throw err
            assert.equal(gottenset.meta.count, 0)
            done()
          })
        })
      })
    })
  })
})
