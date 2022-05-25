#/bin/sh

set -e

# install 7z for unzip ipv6
sudo apt install p7zip-full

# install pnpm
npm i -g pnpm
# setup package
pnpm install
