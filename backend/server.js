'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createApp } = require('./app');

const PORT = process.env.PORT || 8000;

const { start } = createApp();
start(PORT);
