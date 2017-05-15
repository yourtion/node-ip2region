'use strict';

import test from 'ava';

const ip = require('../lib');
const query = ip.create('./data/ip2region.db');

test('btreeSearchSync - Found', t => {
  const res = query.btreeSearchSync('120.24.78.68');
  t.deepEqual(res, { city: 2163, region: '中国|华南|广东省|深圳市|阿里云' });
});

test('btreeSearchSync - Not Found', t => {
  const res = query.btreeSearchSync('10.10.10.10');
  t.deepEqual(res, { city: 0, region: '未分配或者内网IP|0|0|0|0' });
});


test('binarySearchSync - Found', t => {
  const res = query.binarySearchSync('120.24.78.68');
  t.deepEqual(res, { city: 2163, region: '中国|华南|广东省|深圳市|阿里云' });
});

test('binarySearchSync - Not Found', t => {
  const res = query.binarySearchSync('10.10.10.10');
  t.deepEqual(res, { city: 0, region: '未分配或者内网IP|0|0|0|0' });
});
