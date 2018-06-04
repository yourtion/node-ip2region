'use strict';

import test from 'ava';

const IP2Region = require('../lib');
const query = new IP2Region({ inMemory: false });
const query2 = new IP2Region();

test('btreeSearchSync - Found', t => {
  const res = query.btreeSearch('120.24.78.68');
  t.deepEqual(res, { city: 0, region: '中国|0|广东|深圳|阿里云' });
});

test('btreeSearchSync - Not Found', t => {
  const res = query.btreeSearch('10.10.10.10');
  t.deepEqual(res, { city: 0, region: '0|0|0|内网IP|内网IP' });
});

test('btreeSearchSync Parse - Found', t => {
  const res = query.btreeSearch('120.24.78.68', true);
  t.deepEqual(res, { id: 0, country: '中国', region: '0', province: '广东', city: '深圳', isp: '阿里云' });
});

test('btreeSearchSync Parse - Not Found', t => {
  const res = query.btreeSearch('10.10.10.10', true);
  t.deepEqual(res, { id: 0, country: '0', region: '0', province: '0', city: '内网IP', isp: '内网IP' });
});


test('binarySearchSync - Found', t => {
  const res = query.binarySearch('120.24.78.68');
  t.deepEqual(res, { city: 0, region: '中国|0|广东|深圳|阿里云' });
});

test('binarySearchSync - Not Found', t => {
  const res = query.binarySearch('10.10.10.10');
  t.deepEqual(res, { city: 0, region: '0|0|0|内网IP|内网IP' });
});

test('binarySearchSync Parse - Found', t => {
  const res = query.binarySearch('120.24.78.68', true);
  t.deepEqual(res, { id: 0, country: '中国', region: '0', province: '广东', city: '深圳', isp: '阿里云' });
});

test('binarySearchSync Parse - Not Found', t => {
  const res = query.binarySearch('10.10.10.10', true);
  t.deepEqual(res, { id: 0, country: '0', region: '0', province: '0', city: '内网IP', isp: '内网IP' });
});


test('inMemoryBinarySearch - Found', t => {
  const res = query2.binarySearch('120.24.78.68');
  t.deepEqual(res, { city: 0, region: '中国|0|广东|深圳|阿里云' });
});

test('inMemoryBinarySearch - Not Found', t => {
  const res = query2.binarySearch('10.10.10.10');
  t.deepEqual(res, { city: 0, region: '0|0|0|内网IP|内网IP' });
});

test('inMemoryBinarySearch Parse - Found', t => {
  const res = query2.binarySearch('120.24.78.68', true);
  t.deepEqual(res, { id: 0, country: '中国', region: '0', province: '广东', city: '深圳', isp: '阿里云' });
});

test('inMemoryBinarySearch Parse - Not Found', t => {
  const res = query2.binarySearch('10.10.10.10', true);
  t.deepEqual(res, { id: 0, country: '0', region: '0', province: '0', city: '内网IP', isp: '内网IP' });
});


test('inMemoryBtreeSearch - Found', t => {
  const res = query2.btreeSearch('120.24.78.68');
  t.deepEqual(res, { city: 0, region: '中国|0|广东|深圳|阿里云' });
});

test('inMemoryBtreeSearch - Not Found', t => {
  const res = query2.btreeSearch('10.10.10.10');
  t.deepEqual(res, { city: 0, region: '0|0|0|内网IP|内网IP' });
});

test('inMemoryBtreeSearch Parse - Found', t => {
  const res = query2.btreeSearch('120.24.78.68', true);
  t.deepEqual(res, { id: 0, country: '中国', region: '0', province: '广东', city: '深圳', isp: '阿里云' });
});

test('inMemoryBtreeSearch Parse - Not Found', t => {
  const res = query2.btreeSearch('10.10.10.10', true);
  t.deepEqual(res, { id: 0, country: '0', region: '0', province: '0', city: '内网IP', isp: '内网IP' });
});

test('search - Found', t => {
  const res = query2.search('120.24.78.68');
  t.deepEqual(res, { id: 0, country: '中国', region: '0', province: '广东', city: '深圳', isp: '阿里云' });
});

test('search - Not Found', t => {
  const res = query2.search('10.10.10.10');
  t.deepEqual(res, { id: 0, country: '0', region: '0', province: '0', city: '内网IP', isp: '内网IP' });
});

test('search without Parse - Found', t => {
  const res = query2.search('120.24.78.68', false);
  t.deepEqual(res, { city: 0, region: '中国|0|广东|深圳|阿里云' });
});

test('More Search Test', t => {
  query2.search(-1);
  query2.search(0);
  query2.search(4294967040);
  query2.search('');
  query2.search('aa');
  query2.binarySearch('120.24.78.68');
  t.pass();
});

test('Error - init with db file', t => {
  const error = t.throws(() => {
    new IP2Region({ dbPath: '/tmp/db.db' });
  });
  t.is(error.message, '[ip2region] db file not exists : /tmp/db.db');
});
