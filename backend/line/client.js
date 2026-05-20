const line = require('@line/bot-sdk');

function isLineConfigured() {
  return !!(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_CHANNEL_SECRET);
}

function getClient() {
  if (!isLineConfigured()) return null;
  return new line.messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
  });
}

function getBlobClient() {
  if (!isLineConfigured()) return null;
  return new line.messagingApi.MessagingApiBlobClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
  });
}

module.exports = { isLineConfigured, getClient, getBlobClient, line };
