'use strict';

const Benchmark = require('benchmark');
const suite = new Benchmark.Suite();

const IP2Region = require('../lib');
const query2 = new IP2Region({ inMemory: false });
const query = new IP2Region();

const ip = '191.15.147.55';
const local = '127.0.0.1';

suite
  .add('search', function () {
    query.search(ip, false);
    query.search(local, false);
  })
  .add('inMemoryBinarySearch', function () {
    query.binarySearch(ip);
    query.binarySearch(local);
  })
  .add('inMemoryBtreeSearch', function () {
    query.btreeSearch(ip);
    query.btreeSearch(local);
  })
  .add('binarySearchSync', function () {
    query2.binarySearch(ip);
    query2.binarySearch(local);
  })
  .add('btreeSearchSync', function () {
    query2.btreeSearch(ip);
    query2.btreeSearch(local);
  })
  .on('cycle', function (event) {
    console.log(String(event.target));
  })
  .on('complete', function () {
    console.log('Fastest is ' + this.filter('fastest').map('name'));
  })
  .run({ 'async': true });
