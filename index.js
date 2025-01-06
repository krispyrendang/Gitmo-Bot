const { githubHookHandler } = require('./hook-handlers/github-handler');
const { basecampHookHandler } = require('./hook-handlers/basecamp-handler');
const { basecampChatbotHandler } = require('./hook-handlers/basecamp-chatbot-handler');
const { parseTodoLink } = require('./hook-handlers/helper-functions');
const crypto = require('crypto');
const Sentry = require("@sentry/node");

if (process.env.NODE_ENV === "production") {
    Sentry.init({
        dsn: "https://eaf9ca031f114610b44d1b7ecb15ffab@o292223.ingest.sentry.io/4504288860635136",
        tracesSampleRate: 0,
    });
}

// Validate GitHub Webhook secret
const isValidGithubHook = async (event) => {
    const expectedSignature = "sha256=" +
        crypto.createHmac("sha256", process.env.WEBHOOK_SECRET)
            .update(JSON.stringify(JSON.parse(event.body)))
            .digest("hex");
    const signature = event.headers["x-hub-signature-256"];
    return signature === expectedSignature
}


// Program entry
exports.handler = async (event) => {
    const startTime = Date.now();
    let body = JSON.parse(event.body);
    if ("pull_request" in body || "issue" in body || event.headers["x-github-event"] === "pull_request_review_comment") {
        const webhookSecretValid = await isValidGithubHook(event);
        if (!webhookSecretValid) {
            return ({ status: '401' }) // Unauthorized
        }
        return (await githubHookHandler(body, event));
    } else if ("recording" in body) {
        return (await basecampHookHandler(body));
    }
    switch(event.headers["user-agent"]) {
        case 'Basecamp Integration Command':
            return await basecampChatbotHandler(body, startTime);
    }
}
