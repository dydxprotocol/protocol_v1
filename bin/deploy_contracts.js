#! /usr/bin/env node
const shell = require("shelljs");

shell.exec("truffle migrate --network dev");
