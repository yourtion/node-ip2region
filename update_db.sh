#/bin/sh

set -e

curl https://raw.githubusercontent.com/lionsoul2014/ip2region/master/data/ip2region.db > data/ip2region.db

npm test
