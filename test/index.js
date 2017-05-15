'use strict';

const ip = require('./index');

const query = ip.create('./data/ip2region.db');

console.log(query.btreeSearchSync('120.24.78.68'));
console.log(query.btreeSearchSync('10.10.10.10'));

console.log(query.binarySearchSync('120.24.78.68'));
console.log(query.binarySearchSync('10.10.10.10'));
