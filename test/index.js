'use strict';
/* eslint-env node, jest */

const IP2Region = require('../lib');
const query = new IP2Region({ inMemory: false });
const query2 = new IP2Region();

const ALIYUN = Object.freeze({ city: 2163, region: '中国|0|广东省|深圳市|阿里云' });
const ALIYUN2 = Object.freeze({ id: 2163, country: '中国', region: '0', province: '广东省', city: '深圳市', isp: '阿里云' });
const NEIWAN = Object.freeze({ city: 0, region: '0|0|0|内网IP|内网IP' });
const NEIWAN2 = Object.freeze({ id: 0, country: '0', region: '0', province: '0', city: '内网IP', isp: '内网IP' });

test('btreeSearchSync - Found', function () {
  const res = query.btreeSearch('120.24.78.68');
  expect(res).toMatchObject(ALIYUN);
});

test('btreeSearchSync - Not Found', function () {
  const res = query.btreeSearch('10.10.10.10');
  expect(res).toMatchObject(NEIWAN);
});

test('btreeSearchSync Parse - Found', function () {
  const res = query.btreeSearch('120.24.78.68', true);
  expect(res).toMatchObject(ALIYUN2);
});

test('btreeSearchSync Parse - Not Found', function () {
  const res = query.btreeSearch('10.10.10.10', true);
  expect(res).toMatchObject(NEIWAN2);
});


test('binarySearchSync - Found', function () {
  const res = query.binarySearch('120.24.78.68');
  expect(res).toMatchObject(ALIYUN);
});

test('binarySearchSync - Not Found', function () {
  const res = query.binarySearch('10.10.10.10');
  expect(res).toMatchObject(NEIWAN);
});

test('binarySearchSync Parse - Found', function () {
  const res = query.binarySearch('120.24.78.68', true);
  expect(res).toMatchObject(ALIYUN2);
});

test('binarySearchSync Parse - Not Found', function () {
  const res = query.binarySearch('10.10.10.10', true);
  expect(res).toMatchObject(NEIWAN2);
});


test('inMemoryBinarySearch - Found', function () {
  const res = query2.binarySearch('120.24.78.68');
  expect(res).toMatchObject(ALIYUN);
});

test('inMemoryBinarySearch - Not Found', function () {
  const res = query2.binarySearch('10.10.10.10');
  expect(res).toMatchObject(NEIWAN);
});

test('inMemoryBinarySearch Parse - Found', function () {
  const res = query2.binarySearch('120.24.78.68', true);
  expect(res).toMatchObject(ALIYUN2);
});

test('inMemoryBinarySearch Parse - Not Found', function () {
  const res = query2.binarySearch('10.10.10.10', true);
  expect(res).toMatchObject(NEIWAN2);
});


test('inMemoryBtreeSearch - Found', function () {
  const res = query2.btreeSearch('120.24.78.68');
  expect(res).toMatchObject(ALIYUN);
});

test('inMemoryBtreeSearch - Not Found', function () {
  const res = query2.btreeSearch('10.10.10.10');
  expect(res).toMatchObject(NEIWAN);
});

test('inMemoryBtreeSearch Parse - Found', function () {
  const res = query2.btreeSearch('120.24.78.68', true);
  expect(res).toMatchObject(ALIYUN2);
});

test('inMemoryBtreeSearch Parse - Not Found', function () {
  const res = query2.btreeSearch('10.10.10.10', true);
  expect(res).toMatchObject(NEIWAN2);
});

test('search - Found', function () {
  const res = query2.search('120.24.78.68');
  expect(res).toMatchObject(ALIYUN2);
});

test('search - Not Found', function () {
  const res = query2.search('10.10.10.10');
  expect(res).toMatchObject(NEIWAN2);
});

test('search without Parse - Found', function () {
  const res = query2.search('120.24.78.68', false);
  expect(res).toMatchObject(ALIYUN);
});

test('More Search Test', function () {
  query2.search(-1);
  query2.search(0);
  query2.search(4294967040);
  query2.search('');
  query2.search('aa');
  query2.binarySearch('120.24.78.68');
});

test('Error - init with db file', function () {
  const error = () => new IP2Region({ dbPath: '/tmp/db.db' });
  expect(error).toThrow('[ip2region] db file not exists : /tmp/db.db');
});
