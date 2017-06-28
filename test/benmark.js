'use strict';

const Benchmark = require('benchmark');
const suite = new Benchmark.Suite();

const IP2Region = require('../lib');
const query2 = new IP2Region();
const query = new IP2Region({ inMemory: true });

const ip = '191.15.147.55';
const local = '127.0.0.1';

suite
  .add('inMemoryBinarySearch', function () {
    query.inMemoryBinarySearch(ip);
    query.inMemoryBinarySearch(local);
  })
  .add('inMemoryBtreeSearch', function () {
    query.inMemoryBtreeSearch(ip);
    query.inMemoryBtreeSearch(local);
  })
  .add('binarySearchSync', function () {
    query2.binarySearchSync(ip);
    query2.binarySearchSync(local);
  })
  .add('btreeSearchSync', function () {
    query2.btreeSearchSync(ip);
    query2.btreeSearchSync(local);
  })
  .on('cycle', function (event) {
    console.log(String(event.target));
  })
  .on('complete', function () {
    console.log('Fastest is ' + this.filter('fastest').map('name'));
  })
  .run({ 'async': true });
