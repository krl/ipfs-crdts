var async = require('async')
var assert = require('assert')
var ipfs = require('ipfs-api')('localhost', 5001)
var ipo = require('ipfs-obj')(ipfs)

var UnionMap = require('../src/unionmap.js')(ipo)
var HotSet = require('../src/hotset.js')(ipo)

/* global describe, it */

describe('UnionMap', function () {
  describe('basic', function () {
    it('should map foo to a set containing bar', function (done) {
      var map = new UnionMap()
      var set = new HotSet()
      set.add('bar', function (err, set) {
        if (err) throw err
        map.add('foo', set, function (err, res) {
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
    })

    it('should merge un-overlapping maps', function (done) {
      var map1 = new UnionMap()
      var map2 = new UnionMap()
      var set1 = new HotSet()
      var set2 = new HotSet()

      async.parallel([
        function (cb) { set1.add('bar', cb) },
        function (cb) { set2.add('bar', cb) }
      ], function (err, res) {
        if (err) throw err

        async.parallel([
          function (cb) { map1.add('foo', res[0], cb) },
          function (cb) { map2.add('baz', res[1], cb) }
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
    })

    it('should merge overlapping keys', function (done) {
      var map1 = new UnionMap()
      var set1 = new HotSet()
      var set2 = new HotSet()

      async.parallel([
        function (cb) { set1.add('bar', cb) },
        function (cb) { set2.add('baz', cb) }
      ], function (err, res) {
        if (err) throw err

        async.parallel([
          function (cb) { map1.add('foo', res[0], cb) },
          function (cb) { map1.add('foo', res[1], cb) }
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
    })
  })
})
