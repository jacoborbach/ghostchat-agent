#!/usr/bin/env node
'use strict';

const { existsSync } = require('fs');
const args = process.argv.slice(2);
const forceSetup = args.includes('--setup');

async function main() {
  if (existsSync('.env')) {
    require('dotenv').config();
  }

  if (forceSetup || !existsSync('ghostchat.md')) {
    await require('./setup')();
  } else {
    await require('./agent')();
  }
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
