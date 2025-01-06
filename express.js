const express = require('express');
const { handler } = require('./index.js');
const app = express();
const port = 3000; // has to match the port for the "ngrok" npm script

if (process.env.MY_BASECAMP_USER_EMAIL === undefined && process.env.MY_GITHUB_USER_ID === undefined) {
  console.log('\x1b[31m%s\x1b[0m', 'Please run "npm run create-env" to generate a .env.local file');
}
if (!process.env.MY_BASECAMP_USER_EMAIL) console.log('\x1b[31m%s\x1b[0m', 'Please set your Basecamp user email in .env.local');
if (!process.env.MY_GITHUB_USER_ID) console.log('\x1b[31m%s\x1b[0m', 'Please set your GitHub user ID in .env.local');

app.use(express.json());
app.all('/', async (req, res) => {
  res.status(200).send(); // always return 200 in advance in development
  let user;
  if (req.headers['user-agent'] === 'Basecamp3 Webhook') user = req.body.creator?.email_address;
  if (req.headers['user-agent'].startsWith('GitHub-Hookshot')) user = req.body.sender?.login;

  // do not handle webhooks sent by anyone else
  if (user !== process.env.MY_BASECAMP_USER_EMAIL && user !== process.env.MY_GITHUB_USER_ID) return;

  // console.log(req.headers);
  // console.log(req.body);
  try {
    const resp = await handler({
      headers: req.headers,
      body: JSON.stringify(req.body),
    });
    console.log(resp);
  } catch(e) {
    console.error(e);
  }
});

app.listen(port, () => {
  console.log('\x1b[36m%s\x1b[0m', `Gitmo listening on port ${port}`);
});
