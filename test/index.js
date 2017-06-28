'use strict';

import test from 'ava';

const IP2Region = require('../lib');
const query = new IP2Region({ inMemory: false });
const query2 = new IP2Region();

test('btreeSearchSync - Found', t => {
  const res = query.btreeSearchSync('120.24.78.68');
  t.deepEqual(res, { city: 2163, region: '中国|华南|广东省|深圳市|阿里云' });
});

test('btreeSearchSync - Not Found', t => {
  const res = query.btreeSearchSync('10.10.10.10');
  t.deepEqual(res, { city: 0, region: '未分配或者内网IP|0|0|0|0' });
});

test('btreeSearchSync Parse - Found', t => {
  const res = query.btreeSearchSync('120.24.78.68', true);
  t.deepEqual(res, { id: 2163, country: '中国', region: '华南', province: '广东省', city: '深圳市', isp: '阿里云' });
});

test('btreeSearchSync Parse - Not Found', t => {
  const res = query.btreeSearchSync('10.10.10.10', true);
  t.deepEqual(res, { id: 0, country: '未分配或者内网IP', region: '0', province: '0', city: '0', isp: '0' });
});


test('binarySearchSync - Found', t => {
  const res = query.binarySearchSync('120.24.78.68');
  t.deepEqual(res, { city: 2163, region: '中国|华南|广东省|深圳市|阿里云' });
});

test('binarySearchSync - Not Found', t => {
  const res = query.binarySearchSync('10.10.10.10');
  t.deepEqual(res, { city: 0, region: '未分配或者内网IP|0|0|0|0' });
});

test('binarySearchSync Parse - Found', t => {
  const res = query.binarySearchSync('120.24.78.68', true);
  t.deepEqual(res, { id: 2163, country: '中国', region: '华南', province: '广东省', city: '深圳市', isp: '阿里云' });
});

test('binarySearchSync Parse - Not Found', t => {
  const res = query.binarySearchSync('10.10.10.10', true);
  t.deepEqual(res, { id: 0, country: '未分配或者内网IP', region: '0', province: '0', city: '0', isp: '0' });
});


test('inMemoryBinarySearch - Found', t => {
  const res = query2.inMemoryBinarySearch('120.24.78.68');
  t.deepEqual(res, { city: 2163, region: '中国|华南|广东省|深圳市|阿里云' });
});

test('inMemoryBinarySearch - Not Found', t => {
  const res = query2.inMemoryBinarySearch('10.10.10.10');
  t.deepEqual(res, { city: 0, region: '未分配或者内网IP|0|0|0|0' });
});

test('inMemoryBinarySearch Parse - Found', t => {
  const res = query2.inMemoryBinarySearch('120.24.78.68', true);
  t.deepEqual(res, { id: 2163, country: '中国', region: '华南', province: '广东省', city: '深圳市', isp: '阿里云' });
});

test('inMemoryBinarySearch Parse - Not Found', t => {
  const res = query2.inMemoryBinarySearch('10.10.10.10', true);
  t.deepEqual(res, { id: 0, country: '未分配或者内网IP', region: '0', province: '0', city: '0', isp: '0' });
});


test('inMemoryBtreeSearch - Found', t => {
  const res = query2.inMemoryBtreeSearch('120.24.78.68');
  t.deepEqual(res, { city: 2163, region: '中国|华南|广东省|深圳市|阿里云' });
});

test('inMemoryBtreeSearch - Not Found', t => {
  const res = query2.inMemoryBtreeSearch('10.10.10.10');
  t.deepEqual(res, { city: 0, region: '未分配或者内网IP|0|0|0|0' });
});

test('inMemoryBtreeSearch Parse - Found', t => {
  const res = query2.inMemoryBtreeSearch('120.24.78.68', true);
  t.deepEqual(res, { id: 2163, country: '中国', region: '华南', province: '广东省', city: '深圳市', isp: '阿里云' });
});

test('inMemoryBtreeSearch Parse - Not Found', t => {
  const res = query2.inMemoryBtreeSearch('10.10.10.10', true);
  t.deepEqual(res, { id: 0, country: '未分配或者内网IP', region: '0', province: '0', city: '0', isp: '0' });
});

test('search - Found', t => {
  const res = query2.search('120.24.78.68');
  t.deepEqual(res, { id: 2163, country: '中国', region: '华南', province: '广东省', city: '深圳市', isp: '阿里云' });
});

test('search - Not Found', t => {
  const res = query2.search('10.10.10.10');
  t.deepEqual(res, { id: 0, country: '未分配或者内网IP', region: '0', province: '0', city: '0', isp: '0' });
});

test('search without Parse - Found', t => {
  const res = query2.search('120.24.78.68', false);
  t.deepEqual(res, { city: 2163, region: '中国|华南|广东省|深圳市|阿里云' });
});

test('More Search Test', t => {
  query2.search(-1);
  query2.search(0);
  query2.search(4294967040);
  query2.search('');
  query2.search('aa');
  query.btreeSearchSync(-1);
  query.btreeSearchSync(0);
  query.btreeSearchSync(4294967040);
  query.btreeSearchSync('');
  query.btreeSearchSync('aa');
  query2.binarySearchSync('120.24.78.68');
  t.pass();
});

test('Error - init with db file', t => {
  const error = t.throws(() => {
    new IP2Region({ dbPath: '/tmp/db.db' });
  });
  t.is(error.message, '[ip2region] db file not exists : /tmp/db.db');
});
