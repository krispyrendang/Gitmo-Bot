const { Client, Intents } = require('discord.js');
const { once } = require('events');

/**
 * Send a message via discord. Discord and Channel id tokens are set via aws
 * @param {string} msg message to be sent.
 * @param {'kudos'} type 'kudos' to send kudos
 * @param {number} [startTime]
 */
const discordHandler = async (msg, type, startTime = undefined) => {
  if (type !== 'kudos' && type !== 'leaderboard') return false;
  const client = new Client({ intents: Intents.FLAGS.GUILDS });
  client.login(process.env.DISCORD_TOKEN);

  let timeoutId;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(
      () => controller.abort(),
      25000 - (startTime ? Date.now() - startTime : 0)
    );
    await once(client, 'ready', { signal: controller.signal });
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
  let channelId = '';
  if(type == 'kudos') {
    channelId = "968302174264250410";
  } else {
    channelId = "1080934418392297479";
  }
  const channel = await client.channels.fetch(channelId, { cache: false });
  if (!channel) throw 'Channel not found';
  await channel.send(msg);
  return true;
};

exports.discordHandler = discordHandler;
