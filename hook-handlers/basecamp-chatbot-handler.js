const { discordHandler } = require('./discord-handler');
const Sentry = require("@sentry/node");

function response(msg) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: msg,
  };
}

const handler = async ({ command }, startTime) => {
  try {
    if (!await discordHandler(command, 'kudos', startTime)) return response('Something went wrong');
    return response('Message sent to Discord');
  } catch(e) {
    Sentry.captureException(e);
    console.error(e);
    if (typeof e === 'string') return response(e);
  }

  return response('Something went wrong');
}

exports.basecampChatbotHandler = handler;
