
# IPFS CRDTs

In this repo i'll be writing CRDT datastructures for IPFS, using [https://github.com/krl/ipfs-obj/](ipfs-obj).

# Implementation details

The 2p-set datastructure uses persistant Hash-array mapped tries as its underlying storage. This gives us some properties that are very well suited for CRDTs.

A HAMT in the case of a set basically takes the hash of the element you add, and selects in which branch to go based on the digits in the hash, branching out 32 way. If the spot is already taken, a new HAMT is hung on to the previous one, containing both elements.

This gives us x things

## Persistance

Adds to the set does not invalidate the old data, and references to it can be kept in memory and used. Adding simply creates a new set, that share most structure with the old one'. These structures can also be persisted to ipfs, and you'll get a hash reference

## Cheap merging

Merging is as easy as just walking the branches of the root, looking at which ones changed, you only need to merge the branches that actually differ.

## Commutivity

Adds to the set actually commute, so that no matter in which order you insert the elements, you will end up with the same structure in memory, you will even get the *same hash* when persisting! This is a big deal for state-based CRDTS, which usually have the additional problem of providing deltas over the state. Using persistent merkle-trees eliminates this problem completely, as you'll always only have to share the root state in the first transaction, and later parts of the tree can be lazily requested.

# HotSet

Hotset is a 2 phase-set, meaning that it keeps hot and cold (tombstone) sets for allowing commutitive removal of elements. This set is a separate HAMT that is only ever accessed in writing to the set. The read operations look at the hot set only.

## Example

```js
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
```
