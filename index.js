var B2 = require('blake2s-js')
var equal = require('deep-equal')
var stringify = require('json-stable-stringify')
var async = require('async')
var _ = require('lodash')

var BRANCHING = 32

// helpers

var index = function (hash, depth) {
  return parseInt(hash.substr((depth + 1) * 2, 2), 16) % BRANCHING
}

var digest = function (key) {
  var hasher = new B2(32)
  hasher.update(new Buffer(stringify(key)))
  return hasher.hexDigest()
}

// Types

var SetItem = function (hash, element) {
  this.hash = hash
  this.element = element
}

var Branch = function (children) {
  this.children = children
}

var Ref = function (link) {
  this.persisted = link
}

var Root = function (hotOrHash, cold) {
  if (typeof hotOrHash === "string") {
    this.hash = hotOrHash
  } else {
    this.hot = hotOrHash
    this.cold = cold
  }
}

var ipfsWrap = function (ipfs) {

  SetItem.prototype.get = function (hash, depth, cb) {
    // console.log('got at depth', depth)
    if (this.hash === hash) {
      cb(null, this, this.element)
    } else {
      cb(null, this)
    }
  }

  SetItem.prototype.add = function (hash, value, depth, cb) {
    // split
    // console.log('split item')
    var children = {}
    children[index(this.hash, depth)] = this
    var branch = new Branch(children)

    branch.add(hash, value, depth, function (err, res) {
      if (err) return cb(err)
      cb(null, res)
    })
  }

  SetItem.prototype.remove = function (hash, depth, cb) {
    // console.log('setitem remove depth', depth)
    cb(null, this.hash === hash ? null : this)
  }

  SetItem.prototype.persist = function (cb) {
    var self = this

    var data = {
      hash: this.hash,
      element: this.element
    }

    var buf = new Buffer(stringify({
      Data: stringify(data),
      Links: []
    }))

    ipfs.object.put(buf, 'json', function (err, put) {
      if (err) return cb(err)

      ipfs.object.stat(put.Hash, function (err, stat) {
        if (err) return cb(err)
        self.persisted = { Hash: put.Hash,
                           Size: stat.CumulativeSize}
        cb(null, self)
      })
    })
  }

  Branch.prototype.get = function (hash, depth, cb) {
    // console.log('get in branch', hash)
    var self = this
    var idx = index(hash, depth)

    if (self.children[idx]) {
      self.children[idx].get(hash, depth + 1, function (err, branch, res) {
        if (err) return cb(err)
        self.children[idx] = branch
        cb(null, self, res)
      })
    } else {
      cb(null, self)
    }
  }

  Branch.prototype.add = function (hash, value, depth, cb) {
    var idx = index(hash, depth)
    var child = this.children[idx]
    var self = this

    // console.log('branch add depth', depth)

    if (child) {
      child.add(hash, value, depth + 1, function (err, res) {
        if (err) return cb(err)
        self.children[idx] = res
        cb(null, self)
      })
    } else {
      self.children[idx] = new SetItem(hash, value)
      cb(null, self)
    }
  }

  Branch.prototype.remove = function (hash, depth, cb) {
    var idx = index(hash, depth)
    var child = this.children[idx]
    var self = this

    // console.log('branch remove depth', depth)

    if (child) {
      child.remove(hash, depth + 1, function (err, res) {
        if (err) return cb(err)
        if (res === null) {
          delete self.children[idx]
        } else {
          self.children[idx] = res
        }
        cb(null, self)
      })
    } else {
      cb(null, self)
    }
  }

  Branch.prototype.persist = function (cb) {
    var self = this
    // links
    async.map(_.pairs(this.children), function (nameChild, cb2) {
      nameChild[1].persist(function (err, res) {
        if (err) return cb(err)

        // console.log('in branch map')
        // console.log(res)

        cb2(null, {
          Name: nameChild[0],
          Hash: res.persisted.Hash,
          Size: res.persisted.Size
        })
      })
    }, function (err, links) {
      var buf = new Buffer(stringify({
        Data: "b",
        Links: links
      }))

      ipfs.object.put(buf, 'json', function (err, put) {
        if (err) return cb(err)
        ipfs.object.stat(put.Hash, function (err, stat) {
          if (err) return cb(err)
          self.persisted = { Hash: put.Hash,
                             Size: stat.CumulativeSize }
          cb(null, self)
        })
      })
    })
  }

  Root.prototype.add = function (value, cb) {
    var self = this
    var hash = digest(value)

    self.cold.get(hash, 0, function (err, branch, res) {
      if (err) return cb(err)
      self.cold = branch
      // already deleted?
      if (res) return cb(null)

      self.hot.add(hash, value, 0, function (err, hot) {
        err ? cb(err) : cb(null, new Root(hot, self.cold))
      })
    })
  }

  Root.prototype.remove = function (value, cb) {
    var self = this
    var hash = digest(value)

    // console.log('remove', value, 'in root')

    async.parallel([
      function (cb) {
        self.hot.remove(hash, 0, function (err, res) {
          err ? cb(err) : cb(null, res)
        })
      },
      function (cb) {
        self.cold.add(hash, value, 0, function (err, res) {
          err ? cb(err) : cb(null, res)
        })
      }], function (err, hotCold) {
        if (err) return cb(err)
        cb(null, new Root(hotCold[0], hotCold[1]))
      })
  }

  Root.prototype.get = function (key, cb) {
    var self = this
    if (self.hash) {
      restore(self.hash, function (err, res) {
        if (err) return cb(err)
        self.hot = res.hot
        self.cold = res.cold
        delete self.hash
        self.get(key, cb)
      })
    } else {
      self.hot.get(digest(key), 0, function (err, branch, res) {
        if (err) return cb(err)
        self.hot = branch
        cb(null, res)
      })
    }
  }

  Root.prototype.persist = function (cb) {

    var self = this

    var hotLinks = _.pairs(this.hot.children)

    // links
    async.parallel([
      function (cbpara) {
        async.map(hotLinks, function (nameChild, cbmap) {
          nameChild[1].persist(function (err, res) {
            if (err) return cb(err)
            cbmap(null, {
              Name: nameChild[0],
              Hash: res.persisted.Hash,
              Size: res.persisted.Size
            })
          })
        }, cbpara)
      }, function (cbpara) {
        self.cold.persist(cbpara)
      }], function (err, hotLinksColdRef) {
        if (err) return cb(err)

        var links = hotLinksColdRef[0]
        var cold = hotLinksColdRef[1]

        links.push({ Name: "cold",
                     Hash: cold.persisted.Hash,
                     Size: cold.persisted.Size })

        var buf = new Buffer(stringify({
          Data: "hc",
          Links: links
        }))

        ipfs.object.put(buf, 'json', function (err, put) {
          if (err) return cb(err)
          ipfs.object.stat(put.Hash, function (err, stat) {
            if (err) return cb(err)
            self.persisted = { Hash: put.Hash,
                               Size: stat.CumulativeSize }
            cb(null, self)
          })
        })
      })
  }

  Ref.prototype.add = function (hash, value, depth, cb) {
    restore(this.persisted.Hash, function (err, res) {
      if (err) return cb(err)
      res.add(hash, value, depth, cb)
    })
  }

  Ref.prototype.get = function (hash, depth, cb) {
    // console.log("get in ref", hash)
    restore(this.persisted.Hash, function (err, res) {
      if (err) return cb(err)
      res.get(hash, depth, cb)
    })
  }

  Ref.prototype.persist = function (cb) {
    cb(null, this)
  }

  // restore

  var RestoreQueue = {}

  var restore = function (hash, cb) {
    var resolve = function (res) {
      var n = RestoreQueue[hash].length
      for (var i = 0 ; i < n ; i++) {
        RestoreQueue[hash][i](null, res)
      }
      // GC
      delete RestoreQueue[hash]
    }

    if (RestoreQueue[hash]) {
      RestoreQueue[hash].push(cb)
    } else {
      RestoreQueue[hash] = [cb]

      ipfs.object.get(hash, function (err, res) {
        if (err) return cb(err)

        if (res.Data === "hc") {
          var hotLinks = _.filter(res.Links, function (link) {
            return link.name !== "cold"
          })
          var cold = _.filter(res.Links, function (link) {
            return link.name === "cold"
          })[0]

          resolve(new Root(
            new Branch(_.reduce(hotLinks, function (all, link) {
              all[link.Name] = new Ref(link)
              return all
            }, {})),
            new Ref(cold)))

        } else if (res.Data === "b") {
          // branch
          resolve(new Branch(_.reduce(res.Links, function (all, link) {
            all[link.Name] = new Ref(link)
            return all
          }, {})))
        } else {
          // item
          var data = JSON.parse(res.Data)
          resolve(new SetItem(data.hash, data.element))
        }
      })
    }
  }

  return {
    empty: function () {
      return new Root(new Branch({}), new Branch({}))
    },
    restore: function (hash) {
      return new Root(hash)
    }
  }
}

module.exports = ipfsWrap
