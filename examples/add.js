
var async = require('async')
var ipfs = require('ipfs-api')('localhost', 5001)
var ipo = require('ipfs-obj')(ipfs)
var HotSet = require('../src/hotset.js')(ipo)

var elements = [0, 1, 2, 3, 4]

async.reduce(elements, new HotSet(), function (memo, n, cb) {
  memo.add(n, cb)
}, function (err, res) {
  if (err) throw err

  res.all(function (err, res) {
    if (err) throw err
    console.log(res) // => [ 1, 0, 3, 4, 2 ]
  })

  res.persist(function (err, res) {
    if (err) throw err
    console.log(res) // => QmUgyN8eaRUuenjkveQVz47gbwKRXGkkWzG5dXPW12UESV
  })
})
