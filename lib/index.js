'use strict';

/**
 * ip2region client for nodejs (Base on https://github.com/lionsoul2014/ip2region)
 *
 * project: https://github.com/yourtion/node-ip2region
 *
 * @author Yourtion Guo <yourtion@gmail.com>
 * */
const fs = require('fs');
const path = require('path');

function createDeug() {
  if (process.env.NODE_ENV === 'dev') return require('debug')('ip2region:');
  return () => { };
}
const debug = createDeug();

/**
 * Get long value from buffer with specified offset
 *
 * @param {Buffer} buffer
 * @param {Number} offset
 * @returns {Number} long value
 */
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

// for ip2long
const ipbase = [ 16777216, 65536, 256, 1 ];
/**
 * Convert ip to long (xxx.xxx.xxx.xxx to a integer)
 *
 * @param {String} ip IP Address
 * @returns {Number} long value
 */
function ip2long(ip) {
  let val = 0;
  ip.split('.').forEach((ele, i) => {
    val += ipbase[i] * ele;
  });
  return val;
}

class IP2Region {

  constructor(dbPath = '../data/ip2region.db') {
    if(path.isAbsolute(dbPath)) {
      this.dbFilePath = path;
    } else {
      this.dbFilePath = path.resolve(__dirname, dbPath);
    }

    if (!fs.existsSync(this.dbFilePath)) {
      throw(new Error('[ip2region] db file not exists : ' + this.dbFilePath));
    }

    try {
      this.db = fs.openSync(this.dbFilePath, 'r');
    } catch(e) {
      throw(new Error('[ip2region] Can not open ip2region.db file , path : ' + this.dbFilePath));
    }

    // init basic search environment
    this.superBlock = new Buffer(8);
    this.indexBlockLength = 12;
    this.totalHeaderLength = 4096;

    fs.readSync(this.db, this.superBlock, 0, 8, 0);
    this.firstIndexPtr = getLong(this.superBlock, 0);
    this.lastIndexPtr = getLong(this.superBlock, 4);
    this.totalBlocks = (this.lastIndexPtr - this.firstIndexPtr) / this.indexBlockLength + 1;
  }

  destroy(){
    this.dbFilePath = null;
    fs.closeSync(this.db);
  }

  binarySearchSync(ip) {
    let low = 0;
    let mid = 0;
    let high = this.totalBlocks;
    let dataPos = 0;
    let pos = 0;
    let sip = 0;
    let eip = 0;
    const indexBuffer = new Buffer(12);

    if(typeof ip === 'string') ip = ip2long(ip);

    // binary search
    while(low <= high) {
      mid = ((low + high) >> 1);
      pos = this.firstIndexPtr + mid * this.indexBlockLength;
      fs.readSync(this.db, indexBuffer, 0, this.indexBlockLength, pos);
      sip = getLong(indexBuffer, 0);

      debug(' sip : ' + sip + ' eip : ' + eip);
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

    fs.readSync(this.db, dataBuffer, 0, dataLen, dataPos);

    const city_id = getLong(dataBuffer, 0);
    const data = dataBuffer.toString('utf8', 4, dataLen);

    debug(city_id);
    debug(data);

    return { city: city_id, region: data };
  }

  btreeSearchSync(ip){
    const headerIndexBuffer = new Buffer(this.totalHeaderLength);
    let headerSip = null;
    let headerPtr = 0;
    let headerLen = 0;

    if(typeof ip === 'string') ip = ip2long(ip);

    let i = 0;
    let dataPtr = 0;
      // header index handler
    if (headerSip == null) {
      fs.readSync(this.db, headerIndexBuffer, 0, this.totalHeaderLength, 8);
      headerSip = [];
      headerPtr = [];

      let startIp = 0;
      for (i = 0; i < this.totalHeaderLength; i += 8) {
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
    const blockBuffer = new Buffer(blockLen + this.indexBlockLength);
    fs.readSync(this.db, blockBuffer, 0, blockLen + this.indexBlockLength, sptr);

    low = 0;
    high = blockLen / this.indexBlockLength;
      
    let p = 0;
    let sip = 0;
    let eip = 0;
    dataPtr = 0;

    while(low <= high) {
      mid = ((low + high) >> 1);
      p = mid * this.indexBlockLength;
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

    fs.readSync(this.db, dataBuffer, 0, dataLen, dataPtr);

    const city_id = getLong(dataBuffer, 0);
    const data = dataBuffer.toString('utf8', 4, dataLen);

    debug(city_id);
    debug(data);

    return { city: city_id, region: data };
  }
}

module.exports = IP2Region; 
