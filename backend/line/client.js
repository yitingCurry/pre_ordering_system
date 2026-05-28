const line = require('@line/bot-sdk');

function channelAccessToken() {
  return (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
}

function channelSecret() {
  return (process.env.LINE_CHANNEL_SECRET || '').trim();
}

function isLineConfigured() {
  return !!(channelSecret() && channelAccessToken());
}

function getClient() {
  if (!isLineConfigured()) return null;
  return new line.messagingApi.MessagingApiClient({
    channelAccessToken: channelAccessToken()
  });
}

function getBlobClient() {
  if (!isLineConfigured()) return null;
  return new line.messagingApi.MessagingApiBlobClient({
    channelAccessToken: channelAccessToken()
  });
}

module.exports = {
  isLineConfigured,
  getClient,
  getBlobClient,
  channelAccessToken,
  channelSecret,
  line
};
