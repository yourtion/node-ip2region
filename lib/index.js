'use strict';

/**
 * ip2region client for nodejs (Base on https://github.com/lionsoul2014/ip2region)
 *
 * project: https://github.com/yourtion/node-ip2region
 *
 * @author Yourtion Guo <yourtion@gmail.com>
 * */
const fs = require('fs');

// for ip2long
const ipbase = [ 16777216, 65536, 256, 1 ];
const superBlock = new Buffer(8);
const indexBlockLength = 12;
const totalHeaderLength = 4096;

const ip2region = {};
let totalBlocks = 0;
let firstIndexPtr = 0;
let lastIndexPtr = 0;

/**
 * binary search synchronized
 * */
ip2region.binarySearchSync = function (ip) {
  let low = 0;
  let mid = 0;
  let high = totalBlocks;
  let dataPos = 0;
  let pos = 0;
  let sip = 0;
  let eip = 0;
  const indexBuffer = new Buffer(12);

  if(typeof ip === 'string') ip = ip2long(ip);

  // binary search
  while(low <= high) {
    mid = ((low + high) >> 1);
    pos = firstIndexPtr + mid * indexBlockLength;
    fs.readSync(this.db_fd, indexBuffer, 0, indexBlockLength, pos);
    sip = getLong(indexBuffer, 0);

    // console.log( ' sip : ' + sip + ' eip : ' + eip );
    if (ip < sip) {
      high = mid - 1;
    } else {
      eip = getLong(indexBuffer, 4);
      if (ip > eip) {
        low = mid + 1;
      } else {
        dataPos = getLong(indexBuffer, 8);
        break;
      }
    }
  }

  // read data
  if (dataPos === 0) return null;

  const dataLen = ((dataPos >> 24) & 0xFF);
  dataPos = (dataPos & 0x00FFFFFF);
  const dataBuffer = new Buffer(dataLen);

  fs.readSync(this.db_fd, dataBuffer, 0, dataLen, dataPos);

  const city_id = getLong(dataBuffer, 0);
  const data = dataBuffer.toString('utf8', 4, dataLen);

  // console.log(city_id);
  // console.log(data);

  return { city: city_id, region: data };
};


let headerSip = null;
let headerPtr = 0;
let headerLen = 0;


/**
 * btree  search synchronized
 * */
ip2region.btreeSearchSync = function (ip){
  const headerIndexBuffer = new Buffer(totalHeaderLength);
  if(typeof ip === 'string') ip = ip2long(ip);

  let i = 0;
  let dataPtr = 0;
    // header index handler
  if (headerSip == null) {
    fs.readSync(this.db_fd, headerIndexBuffer, 0, totalHeaderLength, 8);
    headerSip = [];
    headerPtr = [];

    let startIp = 0;
    for (i = 0; i < totalHeaderLength; i += 8) {
      startIp = getLong(headerIndexBuffer, i);
      dataPtr = getLong(headerIndexBuffer, i + 4);
      if (dataPtr === 0) break;
            
      headerSip.push(startIp);
      headerPtr.push(dataPtr);
      // header index size count
      headerLen += 1;
    }
  }
    
  // first search  (in header index)
  let low = 0;
  let mid = 0;
  let high = headerLen;
  let sptr = 0;
  let eptr = 0;
    
  while(low <= high) {
    mid = ((low + high) >> 1);
        
    if (ip === headerSip[mid]) {
      if (mid > 0) {
        sptr = headerPtr[mid - 1];
        eptr = headerPtr[mid];
      } else {
        sptr = headerPtr[mid];
        eptr = headerPtr[mid + 1];
      }
      break;
    }
        
    if (ip < headerSip[mid]) {
      if (mid === 0) {
        sptr = headerPtr[mid];
        eptr = headerPtr[mid + 1];
        break;
      } else if (ip > headerSip[mid - 1]) {
        sptr = headerPtr[mid - 1];
        eptr = headerPtr[mid];
        break;
      }
      high = mid - 1;
    } else {
      if (mid === headerLen - 1) {
        sptr = headerPtr[mid - 1];
        eptr = headerPtr[mid];
        break;
      } else if (ip <= headerSip[mid + 1]) {
        sptr = headerPtr[mid];
        eptr = headerPtr[mid + 1];
        break;
      }
      low = mid + 1;
    }
  }
    
  // match nothing
  if (sptr === 0) return null;
    
    // second search (in index)
  const blockLen = eptr - sptr;
  const blockBuffer = new Buffer(blockLen + indexBlockLength);
  fs.readSync(this.db_fd, blockBuffer, 0, blockLen + indexBlockLength, sptr);

  low = 0;
  high = blockLen / indexBlockLength;
    
  let p = 0;
  let sip = 0;
  let eip = 0;
  dataPtr = 0;

  while(low <= high) {
    mid = ((low + high) >> 1);
    p = mid * indexBlockLength;
    sip = getLong(blockBuffer, p);

    if (ip < sip) {
      high = mid - 1;
    } else {
      eip = getLong(blockBuffer, p + 4);
      if (ip > eip) {
        low = mid + 1;
      } else {
        dataPtr = getLong(blockBuffer, p + 8);
        break;
      }
    }
  }

    // read data
  if (dataPtr === 0) return null;
  const dataLen = ((dataPtr >> 24) & 0xFF);
  dataPtr = (dataPtr & 0x00FFFFFF);
  const dataBuffer = new Buffer(dataLen);

  fs.readSync(this.db_fd, dataBuffer, 0, dataLen, dataPtr);

  const city_id = getLong(dataBuffer, 0);
  const data = dataBuffer.toString('utf8', 4, dataLen);

  // console.log(city_id);
  // console.log(data);

  return { city: city_id, region: data };
};


/**
 * convert ip to long (xxx.xxx.xxx.xxx to a integer)
 * */
function ip2long(ip) {
  let val = 0;
  ip.split('.').forEach((ele, i) => {
    val += ipbase[i] * ele;
  });

  return val;
}


/**
 * get long value from buffer with specified offset
 * */
function getLong(buffer, offset){
  let val = (
        (buffer[offset] & 0x000000FF) |
        ((buffer[offset + 1] << 8) & 0x0000FF00) |
        ((buffer[offset + 2] << 16) & 0x00FF0000) |
        ((buffer[offset + 3] << 24) & 0xFF000000)
    );

    // convert to unsigned int
  if (val < 0) {
    val = val >>> 0;
  }
  return val;
}


exports.create = function (db_path){
  if (typeof(db_path) === 'undefined' || fs.exists(db_path)) {
    throw('[ip2region] db file not exists : ' + db_path);
  }
    
  ip2region.db_file_path = db_path;

  try {
    ip2region.db_fd = fs.openSync(ip2region.db_file_path, 'r');
  } catch(e) {
    throw('[ip2region] Can not open ip2region.db file , path : ' + ip2region.db_file_path);
  }

    // init basic search environment
  if (totalBlocks === 0) {
    fs.readSync(ip2region.db_fd, superBlock, 0, 8, 0);
    firstIndexPtr = getLong(superBlock, 0);
    lastIndexPtr = getLong(superBlock, 4);
    totalBlocks = (lastIndexPtr - firstIndexPtr) / indexBlockLength + 1;
  }

  return ip2region;
};


exports.destroy = function (ip2rObj){
  ip2rObj.db_file_path = null;
  fs.closeSync(ip2rObj.db_fd);
};
