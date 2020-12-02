#/bin/sh

set -e

V4_IP_DB='https://raw.githubusercontent.com/lionsoul2014/ip2region/master/data/ip2region.db'
ZXINC_IP_7Z='http://ip.zxinc.org/ip.7z'
TMP_DIR='/tmp'

# 更新 ipv4 库
curl $V4_IP_DB > "${TMP_DIR}/ip2region.db"
mv "${TMP_DIR}/ip2region.db" "data/ip2region.db"
rm -f "${TMP_DIR}/ip2region.db"

# 更新 ipv6 库
rm -f "${TMP_DIR}/ip.7z"
wget ${ZXINC_IP_7Z} -P "${TMP_DIR}"
7z x "${TMP_DIR}/ip.7z" -y -o"${TMP_DIR}/ip"
cp ${TMP_DIR}/ip/ipv6wry.db ./data/
rm -f "${TMP_DIR}/ip.7z"
rm -rf "${TMP_DIR}/ip"

# 测试
npm test
