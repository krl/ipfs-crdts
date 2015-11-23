var async = require('async')
var assert = require('assert')
var _ = require('lodash')
var ipfs = require('ipfs-api')('localhost', 5001)
var ipo = require('ipfs-obj')(ipfs)
var u = require('../src/util.js')

/* global describe, it, before */

var elements = []
var elements2 = []
var count = 200
var timeout = 20000
var numVariations = 4

for (var i = 0 ; i < count ; i++) {
  elements.push(i)
  elements2.push(i + count)
}

var variations = []
for (var i = 0 ; i < numVariations ; i++) {
  variations.push(_.shuffle(elements))
}

var addMany = function (set, values, cb) {
  async.reduce(values, set, function (memo, item, cb) {
    memo.add(item, cb)
  }, cb)
}

var HotSet = require('../src/hotset.js')(ipo)

describe('HotSet', function () {
  describe('basic', function () {
    it('should make a one-element set', function (done) {
      var set = new HotSet()

      set.add(3, function (err, res) {
        if (err) throw err
        assert.equal(res.meta.id, u.digest(3))
        assert.equal(res.meta.count, 1)
        res.get(3, function (err, res) {
          if (err) throw err
          assert.equal(res, 3)
          done()
        })
      })
    })

    it('should make a large set', function (done) {
      addMany(new HotSet(), elements, function (err, res) {
        if (err) throw err
        assert.equal(res.meta.count, count)
        async.map(_.range(count), function (idx, cb) {
          res.get(idx, function (err, res) {
            if (err) throw err
            assert.equal(res, idx)
            cb()
          })
        }, function (err) {
          if (err) throw err
          done()
        })
      })
    })
  })

  describe('remove', function () {
    it('should remove even elements', function (done) {
      this.timeout(timeout)

      addMany(new HotSet(), elements, function (err, res) {
        if (err) throw err
        assert.equal(res.data.hot.meta.count, count, 'before count')
        // remove even elements
        async.reduce(_.range(0, count, 2), res, function (memo, idx, cb) {
          memo.remove(idx, cb)
        }, function (err, res) {
          if (err) throw err

          assert.equal(res.data.hot.meta.count,
                       Math.floor(count / 2), 'hot count')
          assert.equal(res.data.cold.meta.count,
                       Math.ceil(count / 2), 'cold count')

          async.map(_.range(count), function (idx, cb) {
            res.get(idx, function (err, res) {
              if (err) throw err
              if (idx % 2 === 0) {
                assert.equal(res, undefined)
              } else {
                assert.equal(res, idx)
              }
              cb()
            })
          }, function (err) {
            if (err) throw err
            done()
          })
        })
      })
    })

    it('should add then remove elements', function (done) {
      this.timeout(timeout)

      addMany(new HotSet(), elements, function (err, stateA) {
        if (err) throw err
        addMany(stateA, elements2, function (err, stateB) {
          if (err) throw err
          async.reduce(_.range(count, count * 2), stateB, function (memo, idx, cb) {
            memo.remove(idx, cb)
          }, function (err, stateC) {
            if (err) throw err
            assert.deepEqual(stateC.data.hot, stateA.data.hot)
            done()
          })
        })
      })
    })
  })

  describe('commutivity', function () {
    it('should add up to same datastructure in any order', function (done) {
      async.map(variations, function (variation, cb) {
        addMany(new HotSet(), variation, cb)
      }, function (err, res) {
        if (err) throw err
        var compare = res[0]
        for (var i = 1 ; i < res.length ; i++) {
          assert.deepEqual(compare, res[i])
          assert.equal(compare.meta.id, res[i].meta.id)
        }
        done()
      })
    })

    it('should persist to same hash in any order', function (done) {
      this.timeout(timeout)

      async.map(variations, function (variation, cb) {
        addMany(new HotSet(), variation, function (err, res) {
          if (err) throw err
          res.persist(cb)
        })
      }, function (err, res) {
        if (err) throw err
        var compare = res[0]
        for (var i = 1 ; i < res.length ; i++) {
          assert.equal(compare, res[i])
        }
        done()
      })
    })
  })

  describe('persistance', function () {
    it('should persist and restore', function (done) {
      this.timeout(timeout)

      var set = new HotSet()

      addMany(set, elements, function (err, res) {
        if (err) throw err

        res.persist(function (err, res) {
          if (err) throw err
          assert(res)

          ipo.fetch(res, function (err, restored) {
            if (err) throw err

            async.map(_.range(count), function (idx, cb) {
              restored.get(idx, function (err, res) {
                if (err) throw err
                assert.deepEqual(res, idx)
                cb()
              })
            }, function (err) {
              if (err) throw err
              done()
            })
          })
        })
      })
    })
  })

  describe('union', function () {
    var elA = []
    var elB = []
    var elC = []

    var setA, setB, setC, i

    for (i = 0 ; i < count ; i++) { elA.push(i) }
    for (i = 0 ; i < count ; i++) { elB.push(i + count) }
    for (i = 0 ; i < count ; i++) { elC.push(i + count * 2) }

    before(function (done) {
      async.parallel([
        function (cb) { addMany(new HotSet(), elA, cb) },
        function (cb) { addMany(new HotSet(), elB, cb) },
        function (cb) { addMany(new HotSet(), elC, cb) }
      ], function (err, res) {
        if (err) throw err

        setA = res[0]
        setB = res[1]
        setC = res[2]
        done()
      })
    })

    it('should union with self', function (done) {
      setA.union(setA, function (err, res) {
        if (err) throw err
        assert.deepEqual(res, setA)
        done()
      })
    })

    it('should union AB', function (done) {
      async.parallel(
        [
          function (cb) { setA.union(setB, cb) },
          function (cb) { setB.union(setA, cb) }
        ],
        function (err, res) {
          if (err) throw err
          assert.deepEqual(res[0], res[1])
          async.map(_.range(count * 2), function (idx, cb) {
            res[0].get(idx, function (err, res) {
              if (err) throw err
              assert.equal(res, idx)
              cb()
            })
          }, function (err) {
            if (err) throw err
            done()
          })
        })
    })

    it('should union persisted AB', function (done) {
      this.timeout(timeout)

      async.parallel(
        [
          function (cb) {
            setA.persist(function (err, res) {
              if (err) throw err
              ipo.fetch(res, cb)
            })
          },
          function (cb) {
            setB.persist(function (err, res) {
              if (err) throw err
              ipo.fetch(res, cb)
            })
          }
        ],
        function (err, res) {
          if (err) throw err

          res[0].union(res[1], function (err, res) {
            if (err) throw err
            async.map(_.range(count * 2), function (idx, cb) {
              res.get(idx, function (err, res) {
                if (err) throw err
                assert.equal(res, idx)
                cb()
              })
            }, function (err) {
              if (err) throw err
              done()
            })
          })
        })
    })

    it('should union to same structure in any order', function (done) {
      async.parallel(
        [
          function (cb) {
            setA.union(setB, function (err, res) {
              if (err) throw err
              res.union(setC, cb)
            })
          },
          function (cb) {
            setA.union(setC, function (err, res) {
              if (err) throw err
              res.union(setB, cb)
            })
          },
          function (cb) {
            setB.union(setA, function (err, res) {
              if (err) throw err
              res.union(setC, cb)
            })
          },
          function (cb) {
            setB.union(setC, function (err, res) {
              if (err) throw err
              res.union(setA, cb)
            })
          },
          function (cb) {
            setC.union(setA, function (err, res) {
              if (err) throw err
              res.union(setB, cb)
            })
          },
          function (cb) {
            setC.union(setB, function (err, res) {
              if (err) throw err
              res.union(setA, cb)
            })
          }
        ],
        function (err, res) {
          if (err) throw err

          var compare = res[0]
          for (var i = 1 ; i < res.length ; i++) {
            assert.deepEqual(compare, res[i])
            assert.equal(compare.meta.id, res[i].meta.id)
          }
          done()
        })
    })

    it('should union with deleted elements', function (done) {
      async.parallel([
        function (cb) { setA.remove(Math.floor(count * 0.5), cb) },
        function (cb) { setB.remove(Math.floor(count * 1.5), cb) }
      ], function (err, res) {
        if (err) throw err
        var setAr = res[0]
        var setBr = res[1]

        setAr.union(setBr, function (err, res) {
          if (err) throw err
          async.map(_.range(count * 2), function (idx, cb) {
            res.get(idx, function (err, res) {
              if (err) throw err
              if (idx === Math.floor(count * 0.5) ||
                  idx === Math.floor(count * 1.5)) {
                assert.equal(res, undefined)
              } else {
                assert.equal(res, idx)
              }
              cb()
            })
          }, function (err) {
            if (err) throw err
            done()
          })
        })
      })
    })
  })

  describe('notIn', function () {
    var elA = []
    var elB = []
    var elC = []

    var setA, setB, setC, i

    for (i = 0 ; i < count ; i++) { elA.push(i) }
    for (i = 0 ; i < count ; i++) { elB.push(i + count) }
    for (i = 0 ; i < count ; i++) { elC.push(i + count * 2) }

    before(function (done) {
      async.parallel([
        function (cb) { addMany(new HotSet(), elA, cb) },
        function (cb) { addMany(new HotSet(), elB, cb) },
        function (cb) { addMany(new HotSet(), elC, cb) }
      ], function (err, res) {
        if (err) throw err

        setA = res[0]
        setB = res[1]
        setC = res[2]
        done()
      })
    })

    it('notIn itself should be empty', function (done) {
      setA.notIn(setA, function (err, res) {
        if (err) throw err
        assert.equal(res.meta.id, u.empty)
        done()
      })
    })

    it('Should subtract sets properly', function (done) {
      async.parallel(
        [
          function (cb) { setA.union(setB, cb) },
          function (cb) { setA.union(setC, cb) },
          function (cb) { setB.union(setC, cb) },
          function (cb) {
            setA.union(setB, function (err, res) {
              if (err) return cb(err)
              res.union(setC, cb)
            })
          }
        ], function (err, res) {
          if (err) throw err
          var setAB = res[0]
          var setAC = res[1]
          var setBC = res[2]
          var setABC = res[3]

          async.parallel(
            [
              function (cb) {
                setAB.notIn(setA, function (err, res) {
                  if (err) throw err
                  assert.deepEqual(res, setB)
                  cb()
                })
              },
              function (cb) {
                setAB.notIn(setB, function (err, res) {
                  if (err) throw err
                  assert.deepEqual(res, setA)
                  cb()
                })
              },
              function (cb) {
                setAC.notIn(setA, function (err, res) {
                  if (err) throw err
                  assert.deepEqual(res, setC)
                  cb()
                })
              },
              function (cb) {
                setAC.notIn(setC, function (err, res) {
                  if (err) throw err
                  assert.deepEqual(res, setA)
                  cb()
                })
              },
              function (cb) {
                setBC.notIn(setB, function (err, res) {
                  if (err) throw err
                  assert.deepEqual(res, setC)
                  cb()
                })
              },
              function (cb) {
                setBC.notIn(setC, function (err, res) {
                  if (err) throw err
                  assert.deepEqual(res, setB)
                  cb()
                })
              },
              function (cb) {
                setABC.notIn(setA, function (err, res) {
                  if (err) throw err
                  assert.deepEqual(res, setBC)
                  cb()
                })
              },
              function (cb) {
                setABC.notIn(setB, function (err, res) {
                  if (err) throw err
                  assert.deepEqual(res, setAC)
                  cb()
                })
              },
              function (cb) {
                setABC.notIn(setC, function (err, res) {
                  if (err) throw err
                  assert.deepEqual(res, setAB)
                  cb()
                })
              },
              function (cb) {
                setABC.notIn(setAB, function (err, res) {
                  if (err) throw err
                  assert.deepEqual(res, setC)
                  cb()
                })
              },
              function (cb) {
                setABC.notIn(setAC, function (err, res) {
                  if (err) throw err
                  assert.deepEqual(res, setB)
                  cb()
                })
              },
              function (cb) {
                setABC.notIn(setBC, function (err, res) {
                  if (err) throw err
                  assert.deepEqual(res, setA)
                  cb()
                })
              }
            ], function (err, res) {
              if (err) throw err
              done()
            })
        })
    })

    it('Should subtract items properly', function (done) {
      (new HotSet()).add('wonk', function (err, wonkset) {
        if (err) throw err
        async.parallel(
          [
            function (cb) { setA.union(wonkset, cb) },
            function (cb) { setB.union(wonkset, cb) },
            function (cb) { setC.union(wonkset, cb) }
          ], function (err, res) {
            if (err) throw err

            var setAw = res[0]
            var setBw = res[1]
            var setCw = res[2]

            async.parallel(
              [
                function (cb) {
                  setAw.notIn(setA, function (err, res) {
                    if (err) throw err

                    assert.deepEqual(res, wonkset)
                    cb()
                  })
                },
                function (cb) {
                  setBw.notIn(setB, function (err, res) {
                    if (err) throw err

                    assert.deepEqual(res, wonkset)
                    cb()
                  })
                },
                function (cb) {
                  setCw.notIn(setC, function (err, res) {
                    if (err) throw err

                    assert.deepEqual(res, wonkset)
                    cb()
                  })
                }
              ], function (err, res) {
                if (err) throw err
                done()
              })
          })
      })
    })
  })
})
