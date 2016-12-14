'use strict';

var util = require('util');
var openVeoAPI = require('@openveo/api');
var Database = openVeoAPI.Database;

function FakeVideoDatabase() {
}

module.exports = FakeVideoDatabase;
util.inherits(FakeVideoDatabase, Database);

FakeVideoDatabase.prototype.get = function(collection, criteria, projection, limit, callback) {
  if (criteria && criteria.id === 'error')
    callback(new Error('Error'));
  else {
    var id = 1;
    if (criteria && criteria.id) {
      if (criteria.id.$in) id = criteria.id.$in;
      else id = criteria.id;
    }

    callback(null, [{
      id: id,
      state: 12,
      files: [],
      type: 'type'
    }]);
  }
};

FakeVideoDatabase.prototype.insert = function(collection, data, callback) {
  callback(null, (Array.isArray(data) ? data.length : 1), (Array.isArray(data) ? data : [data]));
};

FakeVideoDatabase.prototype.update = function(collection, criteria, data, callback) {
  if (criteria.id === 'error' || (criteria.id.$in && criteria.id.$in[0] === 'error'))
    callback(new Error('Error'));
  else
    callback(null);
};

FakeVideoDatabase.prototype.remove = function(collection, filter, callback) {
  callback(null, 1);
};
