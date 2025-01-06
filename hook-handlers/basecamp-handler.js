const basecampComment = require('../basecamp-calls/dispatcher');
const { addUserToDB, deleteUserFromDB, listAllUsers, getAllDiscordUserPoints, updatePoints, resetPoints } = require("../database");
const { POINTS_COMMAND } = require('./const');
const { parseTodoLinkBC, parseBasecampComment, checkGitmoCommand } = require('./helper-functions')

// Handle @Gitmo commands from Basecamp
const basecampHookHandler = async (body) => {
    if (body.kind === 'todo_description_changed') {
        var commentQA = ``;

        let senderSGIDQA = body.creator.attachable_sgid;
        if (senderSGIDQA === process.env.GITMO_SGID) return { status: '200' }; // ignore comments made by Gitmo itself
        
        // to-do ID
        let IDsQA = parseTodoLinkBC(body.recording.app_url);
        
        // Set headers
        let optionsQA = basecampComment.options;
        let tokenQA = await basecampComment.getAccessToken();
        if (tokenQA === "FAILED") {
            return ({status: "500"})
        }
        optionsQA.headers.Authorization = `Bearer ${tokenQA}`;

        todoData = await basecampComment.basecampGetToDo(IDsQA[0], optionsQA)
        if (!todoData.data.description.includes(process.env.GITMO_SGID) && !todoData.data.description.includes("testing completed")) return { status: '200' }

        todoDesc = todoData.data.description.replace(/<[^>]*>/g, ' ').replace(/\r?\n|\r/, "").trim()
        let passCount = (todoDesc.toLowerCase().match(/test passed/g) || []).length;
        let failCount = (todoDesc.toLowerCase().match(/test failed/g) || []).length;

        let assigneeSGIDs = [];
        todoData.data.assignees?.forEach(assign => {
            assigneeSGIDs.push(assign.attachable_sgid)
        });

        for (id of assigneeSGIDs) {
            commentQA += `<bc-attachment sgid=${id}></bc-attachment> `
        }

        let removeGitmo = todoData.data.description.substr(todoData.data.description.search(process.env.GITMO_SGID) - 21, todoData.data.description.search("testing completed") + 12);
        let desc = todoData.data.description.replace(removeGitmo, '')

        if (desc.includes("<div>")) {
            desc = desc + "</div>"
        } else if (desc.includes("</div>")) {
            desc = "<div>" + desc
        }

        console.log(desc)
       
        await basecampComment.basecampComment(IDsQA, commentQA + `${passCount}/${passCount + failCount} Tests Passed`, optionsQA)
        if (failCount === 0) {
            await basecampComment.basecampUpdateToDoQA(IDsQA, '🟣', desc, todoData, optionsQA)
            await basecampComment.basecampKanbanCard(IDsQA, "Passed Testing")
        } else {
            await basecampComment.basecampUpdateToDoQA(IDsQA, '🔴', desc, todoData, optionsQA)
            await basecampComment.basecampKanbanCard(IDsQA, "In Progress")
        }
    }

    if (body.kind === 'comment_created') {
        let senderSGID = body.creator.attachable_sgid;
        if (senderSGID === process.env.GITMO_SGID) return { status: '200' }; // ignore comments made by Gitmo itself

        // IDs in an array
        let IDs = parseTodoLinkBC(body.recording.parent.app_url);

        // Set headers
        let options = basecampComment.options;
        let token = await basecampComment.getAccessToken();
        if (token === "FAILED") {
            return ({status: "500"})
        }
        options.headers.Authorization = `Bearer ${token}`;

        const { sgids, words } = await parseBasecampComment(body.recording.content).catch(() => ({}));
        if (!sgids || sgids.length === 0 || !words) return ({ status: '200' });
        if (sgids[0] !== process.env.GITMO_SGID) return ({ status: '200' }); // ignore comments not starting with @Gitmo

        sgids.shift(); // skip Gitmo's SGID

        let comment = await getCommandResult(senderSGID, sgids, words, body.recording.app_url, body.recording.content); // content to post as reply to the Gitmo command
        if (comment) {
            await basecampComment.basecampComment(IDs, comment, options);
            return ({ status: '200' });
        } else {
            return ({ status: '200' });
        }
    }
}

const adminSGIDs = [
    process.env.GRANT_SGID,
    process.env.RACHEL_SGID,
]; // Add additional admins here

const supportedCommandsMsg = [
    "Add points to a user:<br />@Gitmo {amount} points to @BasecampUser",
    "Remove points from a user:<br />@Gitmo -{amount} points to @BasecampUser",
    "Add a new Gitmo user:<br />@Gitmo admin add @BasecampUser github_username display_name",
    "Delete a Gitmo user:<br />@Gitmo admin delete @BasecampUser",
    "List all users:<br />@Gitmo admin list users",
    "Reset all points to 0:<br />@Gitmo admin reset points",
]

const adminOnlyCommands = ['add', 'delete', 'list', 'reset'];
async function getCommandResult(senderSGID, sgids, words, commentLink, comment) {
    let mentionedUserSGID = sgids[0];
    // Response for missing GitHub name in @Gitmo add command
    let missingGHAddContent = `❌ I don't understand what you're saying, ask me like this instead:<br/>@Gitmo admin add @BasecampUser github_username display_name<br/>`;
    // Response for unsupported @Gitmo commands
    let unknownCommandContent = `<div><bc-attachment sgid=${senderSGID}></bc-attachment> I don't know that command 😢<br /><br /> <b>Supported commands</b><br />${supportedCommandsMsg.join("<br/><br/>")}</div>`;
    const unauthorized = `🔴 I'm sorry <bc-attachment sgid=${senderSGID}></bc-attachment>, I'm afraid I can't do that.`;

    if (words.length === 0) return unknownCommandContent;

    let adminCommandAuthorized = false;

    if (!await checkGitmoCommand(comment)) return false

    if (words[0] === "admin") { // Verify admin SGIDs for admin commands
        if (!adminSGIDs.includes(senderSGID)) return unauthorized;
        words.shift(); // skips admin as first word
        adminCommandAuthorized = true;
    } else { return unknownCommandContent }

    if (!words.length) return unknownCommandContent
    const firstWord = words[0].toLowerCase(); // first word skipping @ mentions and the first "admin" word
    if (adminOnlyCommands.includes(firstWord) && !adminCommandAuthorized) return unauthorized;
    switch (firstWord) {
        case "add":
            if (!mentionedUserSGID) return '❌ Hmm... I don\'t know who you are trying to add.<br/><br/>Try this:<br/>@Gitmo admin add @BasecampUser github_username display_name';
            if (words.length < 3) return missingGHAddContent;
            return await addUserToDB(words[1], mentionedUserSGID, words[2]);
        case "delete":
            if (!mentionedUserSGID) return '❌ Hmm... I don\'t know who you are trying to delete.<br/><br/>Try this:<br/>@Gitmo admin delete @BasecampUser';
            return await deleteUserFromDB(mentionedUserSGID);
        case "list":
            if (words[1].toLowerCase() !== "users") return unknownCommandContent;
            return await listAllUsers();
        case "reset":
            if (words[1].toLowerCase() !== "points") return unknownCommandContent;
            let successful = await resetPoints().catch(() => {});
            return successful ? '✅ Okie dokie! I\'ve reset everyone\'s points to 0.' : '❌ Uhh... I couldn\'t reset the points for some reason.';
        case "spelling":
            return await updatePointsAndPostLeaderboard(mentionedUserSGID, -1, senderSGID, commentLink, POINTS_COMMAND.SPELLING);
        case "no":
            if (words[1].toLowerCase() !== "task") return unknownCommandContent;
            return await updatePointsAndPostLeaderboard(mentionedUserSGID, -5, senderSGID, commentLink, POINTS_COMMAND.NO_TASK);
        default:
            if (words[1] !== "points" && words[1] !== "point") return unknownCommandContent;

            // handle add/remove points command
            if (words.length < 3) return "❌ I don't understand what you're saying, ask me like this instead:<br />@Gitmo {amount} points to @BasecampUser<br />";
            const amount = parseInt(words[0]);
            if (!amount) return "❌ I don't know how many points you want."
            if (amount > 50) return "❌ Woah there dude! That's way too many points. I can only give 50 points or less."
            if (amount < -50) return "❌ Hey now... you don't have have to be so mean. I can only take away 50 points or less."
            if (words[1] === "point" && Math.abs(amount) !== 1) return "❌ C'mon bro, you missing an S at the end of point.";
            if (words[1] === "points" && Math.abs(amount) === 1) return "❌ It's 1 point not points dude...";
            return await updatePointsAndPostLeaderboard(mentionedUserSGID, amount, senderSGID, commentLink);
    }
}

async function updatePointsAndPostLeaderboard(userSGID, points, senderSGID, commentLink, commandType = POINTS_COMMAND.DEFAULT) {
    let res = await updatePoints(userSGID, points).catch(() => false);
    if (!res) return "❌ Uh oh... I couldn't update the points for some reason.";
    res = await getAllDiscordUserPoints(senderSGID, userSGID, points, commentLink, commandType).catch(() => false);
    if (!res) return "⚠ Uh oh... I couldn't post the updated leaderboard. But the points were successfully updated.";
    return ""; // no need for success message since leaderboard with updated points will be posted to Discord
}

exports.basecampHookHandler = basecampHookHandler;