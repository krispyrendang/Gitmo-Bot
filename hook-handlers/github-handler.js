const {
    getSGIDFromDB
} = require("../database");
const {
    parseTodoLinkGH,
    parseGitmoAuthor
} = require("./helper-functions");
const basecampComment = require("../basecamp-calls/dispatcher");
const Sentry = require("@sentry/node");

//Test comment

// Handle all incoming GitHub Webhooks
const githubHookHandler = async (body, event) => {
    let content = ``;
    let emoji = '';
    let action;
    let IDs;
    let basecampIDs = [];
    let dependentIDs = [];
    let listName = "";
    let sgid;
    let prRedirect = '';
    let reviewRequested = body.action == "review_requested";
    let assigned = body.action == "assigned";
    let flag = 0;
    let mergeFlag = false;
    let relayFlag = false;
    let unassigned = false;
    let contentRelayed;
    let match;
    let summary = ``; 
    let prSummary = ``;
    let assigneesGithub = ``;
    let revieweeGithub = ``;
    const descriptionDivider = `______________________`;
    let number;

    if(body.pull_request){
        number = body.pull_request.number
        if(body.pull_request.assignees !== null){
            for (let assignee of body.pull_request.assignees){
                let temp = await getSGIDFromDB(assignee.login);
                assigneesGithub += temp.Item.display_name.S + " ";
            }
        }   

        if(body.pull_request.requested_reviewer !== null){
            for (let reviewers of body.pull_request.requested_reviewers){
                let tempVar = await getSGIDFromDB(reviewers.login);
                revieweeGithub += tempVar.Item.display_name.S + " ";
            }
        }
    }

    if(body.issue){
        number = body.issue.number
        if(body.issue.assignees !== null){
            for (let assignee of body.issue.assignees){
                let temp = await getSGIDFromDB(assignee.login);
                assigneesGithub += temp.Item.display_name.S + " ";
            }
        } 
    }
        

    // Set headers
    let options = basecampComment.options;
    let token = await basecampComment.getAccessToken();
    if (token === "FAILED") {
        return ({
            status: "500"
        });
    }
    options.headers.Authorization = `Bearer ${token}`;

    try {
        switch (event.headers["x-github-event"]) {
            case "pull_request_review_comment":
                IDs = parseTodoLinkGH(body.pull_request.body);
                break;
            case "issue_comment":
            default:
                IDs = body.action === "created" ? parseTodoLinkGH(body.issue.body) : parseTodoLinkGH(body.pull_request.body);
                break;
        }

    } catch (error) {
        Sentry.captureException(error);
        console.log(error);
        return ({
            status: '400'
        })
    }

    //Seperating IDs into basecamp linked todos and dependent tasks 
    IDs.forEach(ids => {
        if (!ids.isDependent) {
            basecampIDs.push(ids)
        } else {
            dependentIDs.push(ids)
        }
    })

    // Check if PR changes requested or PR approved
    if (body.action === "submitted") {
        prLink = body.review.html_url;
        let dbSenderData;
        try {
            dbSenderData = await getSGIDFromDB(body.sender.login);
        } catch (error) {
            return ({
                status: "500"
            })
        }

        // If requester of changes not a registered Gitmo user, handle differently
        if (!("Item" in dbSenderData) && body.review.state === "changes_requested") {
            action = "changes_requested_anon";
        } else if (!("Item" in dbSenderData) && body.review.state === "approved") {
            action = "changes_approved_anon";
        } else if (!("Item" in dbSenderData) && body.review.state === "commented") {
            action = "commented_anon";
        } else {
            action = body.review.state;
            sgid = dbSenderData.Item.basecamp_sgid.S;
        }
    } else {
        action = body.action;
    }

    
    // Set content (and send Basecamp comments if reviewer(s) requested)
    switch (action) {
        case "opened":
            prRedirect = body.pull_request.html_url;
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;

            if (!body.pull_request.draft) {
                content = `🟢 <a href=${prRedirect}>Pull Request #${String(number)}</a> is open - ${body.pull_request.title}`;
                emoji = '🟢'
                listName = "Ready for Review"
            } else {
                content = `⚪ <a href=${prRedirect}>Draft Pull Request #${String(number)}</a> created - ${body.pull_request.title}`;
                emoji = '⚪'
                listName = "In Progress"
            }
            break;
        case "reopened":
            prRedirect = body.pull_request.html_url;
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;

            if (!body.pull_request.draft) {
                content = `🟢 <a href=${prRedirect}>Pull Request #${String(number)}</a> is re-opened - ${body.pull_request.title}`;
                emoji = '🟢'
                listName = "Ready for Review"
            } else {
                content = `⚪ <a href=${prRedirect}>Draft Pull Request #${String(number)}</a> is re-opened - ${body.pull_request.title}`;
                emoji = '⚪'
                listName = "In Progress"
            }
            break;
        case "ready_for_review":
            prRedirect = body.pull_request.html_url;
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;

            content = `🟢 <a href=${prRedirect}>Pull Request #${String(number)}</a> is open - ${body.pull_request.title}`;
            emoji = '🟢'
            listName = "Ready for Review"
            break;
        case "converted_to_draft":
            prRedirect = body.pull_request.html_url;
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;

            content = `⚪ <a href=${prRedirect}>Pull Request #${String(number)}</a> converted to draft - ${body.pull_request.title}`;
            emoji = '⚪'
            listName = "In Progress"
            break;
        case "closed":
            prRedirect = body.pull_request.html_url;
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;

            if (body.pull_request.merged) {
                // Merged
                content = `🟣 <a href=${prRedirect}>Pull Request #${String(number)}</a> is merged - ${body.pull_request.title}`;
                dependentContent = `🟣 <a href=${prRedirect}>Dependent PR #${String(number)}</a> has been merged.`
                emoji = '🟣'
                listName = "Ready for Testing"
                mergeFlag = true;

                for (const currentID of basecampIDs) {
                    let listNameMerged;
                    let tempID = [currentID];

                    if (currentID.isCard) {
                        await basecampComment.basecampComment(tempID, content, options);
                        await basecampComment.basecampUpdate(tempID, flag, title, prSummary, options);
                    } else {
                        let todoItemInfo = await basecampComment.basecampGetToDo(currentID, options);

                        let label = await basecampComment.basecampGetToDoLabel(currentID);

                        for (nameOfLabel of label?.data) {
                            if (nameOfLabel.name === 'non-QA testing') {
                                listNameMerged = "Passed Testing";
                                flag = 2;
                                await basecampComment.basecampKanbanCard(tempID, listNameMerged);
                            }
                        }

                        if (flag !== 2) {
                            if (todoItemInfo.data?.assignees.length == 0) {
                                flag = 1;
                            }
                            for (sgid of todoItemInfo.data?.assignees) {
                                if (sgid.attachable_sgid === process.env.QA_SGID) {
                                    flag = 3;
                                    break;
                                } else {
                                    flag = 1;
                                    break;
                                }
                            }
                        }

                    await basecampComment.basecampComment(tempID, content, options);
                    await basecampComment.basecampUpdate(tempID, flag, emoji, summary, options);
                    if (!listNameMerged) {
                        await basecampComment.basecampKanbanCard(tempID, listName);
                    }
                    
                    if (flag === 3) {
                        await basecampComment.basecampComment(tempID, `<bc-attachment sgid=${process.env.QA_SGID}></bc-attachment> this task is ready for testing.<br/>`, options)
                    }
                    
                    flag = 0;
                }

                if (!dependentIDs) break;
                    try {
                        await basecampComment.basecampComment(dependentIDs, dependentContent, options);
                    } catch (error) {
                        return ({
                            status: "500"
                        });
                    }
                }
            } else {
                // Closed
                content = `🔴 <a href=${prRedirect}>Pull Request #${String(number)}</a> is closed - ${body.pull_request.title}`;
                emoji = '🔴'
                listName = "In Progress"
            }
            break;
        case "review_requested":
            if (body.pull_request.draft) {
                return ({
                    status: "200"
                });
            }
            let reviewersGithub = body.requested_reviewer.login;
            let reviewerBasecampData;
            try {
                reviewerBasecampData = await getSGIDFromDB(reviewersGithub);
            } catch (error) {
                return ({
                    status: "500"
                })
            }
            prRedirect = body.pull_request.html_url;
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;

            if (!("Item" in reviewerBasecampData)) {
                content += `🔍 <a href=${prRedirect}>Review request</a> for @${reviewersGithub}<br/>`;
            } else {
                let reviewerSgid = reviewerBasecampData.Item.basecamp_sgid.S;
                content += `🔍 <a href=${prRedirect}>Review request</a> for <bc-attachment sgid=${reviewerSgid}></bc-attachment><br/>`;
            }
            try {
                if (assigneesGithub === "" && revieweeGithub === ""){
                    prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li>${descriptionDivider}</ul>`;          
                    summary = prSummary;
                } else if (assigneesGithub === "" && revieweeGithub !== ""){
                    prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;          
                    summary = prSummary;
                } else if (revieweeGithub === "" && assigneesGithub !== ""){
                    prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li>${descriptionDivider}</ul>`;
                    summary = prSummary;
                }

                await basecampComment.basecampComment(basecampIDs, content, options);
                await basecampComment.basecampUpdate(basecampIDs, flag, "assignee", summary, options);

            } catch (error) {
                return ({
                    status: "5001   " + error
                });
            }

            break;
        case "assigned":
            if (body.pull_request.draft) {
                return ({
                    status: "200"
                });
            }
            let assignedGithub = body.assignee.login;
            let assignedBasecampData
            try {
                assignedBasecampData = await getSGIDFromDB(assignedGithub);
            } catch (error) {
                return ({
                    status: "500"
                })
            }
            prRedirect = body.pull_request.html_url;
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;

            if (!("Item" in assignedBasecampData)) {
                content += `📎 <a href=${prRedirect}>Assigned</a> to @${assignedGithub}<br/>`;
            } else {
                let assignedSgid = assignedBasecampData.Item.basecamp_sgid.S;
                content += `📎 <a href=${prRedirect}>Assigned</a> to <bc-attachment sgid=${assignedSgid}></bc-attachment><br/>`;
            }
            try {
                if (assigneesGithub === "" && revieweeGithub === ""){
                    prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li>${descriptionDivider}</ul>`;          
                    summary = prSummary;
                } else if (assigneesGithub === "" && revieweeGithub !== ""){
                    prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;          
                    summary = prSummary;
                } else if (revieweeGithub === "" && assigneesGithub !== ""){
                    prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li>${descriptionDivider}</ul>`;
                    summary = prSummary;
                }

                await basecampComment.basecampComment(basecampIDs, content, options);
                await basecampComment.basecampUpdate(basecampIDs, flag, "assignee", summary, options);

            } catch (error) {
                return ({
                    status: "500"
                });
            }

            break;
        case "unassigned":
            prRedirect = body.pull_request.html_url
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;
            unassigned = true;

            if (assigneesGithub === "" && revieweeGithub === ""){
                prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li>${descriptionDivider}</ul>`;          
                summary = prSummary;
            } else if (assigneesGithub === "" && revieweeGithub !== ""){
                prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;          
                summary = prSummary;
            } else if (revieweeGithub === "" && assigneesGithub !== ""){
                prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li>${descriptionDivider}</ul>`;
                summary = prSummary;
            }

            await basecampComment.basecampUpdate(basecampIDs, flag, "assignee", summary, options);
            break;
        case "review_request_removed":
            prRedirect = body.pull_request.html_url
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;
            unassigned = true;

            if (assigneesGithub === "" && revieweeGithub === ""){
                prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li>${descriptionDivider}</ul>`;          
                summary = prSummary;
            } else if (assigneesGithub === "" && revieweeGithub !== ""){
                prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;          
                summary = prSummary;
            } else if (revieweeGithub === "" && assigneesGithub !== ""){
                prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li>${descriptionDivider}</ul>`;
                summary = prSummary;
            }

            await basecampComment.basecampUpdate(basecampIDs, flag, "assignee", summary, options);
            break;
        case "changes_requested":
            prRedirect = body.review.html_url;
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;

            content = `📝 <bc-attachment sgid=${sgid}></bc-attachment> <a href=${prRedirect}>requested changes</a>`;
            if(body.pull_request.draft){
                emoji = '⚪'
            } else {
                emoji = '🟢'
            }

            match = body.review.body.trim().toLowerCase().match("@gitmo relay");
            if(match !== null){
                if (match[0] === "@gitmo relay") {
                    try {
                        contentRelayed = await parseGitmoAuthor(body.sender.login, body.review.body);
                        relayFlag = true;
                    } catch (error) {
                        return ({
                            status: '500'
                        });
                    }
                }
            }
            break;
        case "changes_requested_anon":
            prRedirect = body.pull_request.html_url;
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;

            content = `📝 @${body.review.user.login} <a href=${prRedirect}>requested changes</a>`;
            if(body.pull_request.draft){
                emoji = '⚪'
            } else {
                emoji = '🟢'
            }

            match = body.review.body.trim().toLowerCase().match("@gitmo relay");
            if(match !== null){
                if (match[0] === "@gitmo relay") {
                    try {
                        contentRelayed = await parseGitmoAuthor(body.sender.login, body.review.body);
                        relayFlag = true;
                    } catch (error) {
                        return ({
                            status: '500'
                        });
                    }
                }
            }
            break;
        case "approved":
            prRedirect = body.pull_request.html_url;
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;

            content = `✅ <bc-attachment sgid=${sgid}></bc-attachment> <a href=${prRedirect}>approved changes</a>`;
            if(body.pull_request.draft){
                emoji = '⚪'
            } else {
                emoji = '🟢'
            }
            
            match = body.review.body.trim().toLowerCase().match("@gitmo relay");
            if(match !== null){
                if (match[0] === "@gitmo relay") {
                    try {
                        contentRelayed = await parseGitmoAuthor(body.sender.login, body.review.body);
                        relayFlag = true;
                    } catch (error) {
                        return ({
                            status: '500'
                        });
                    }
                }
            }
            break;
        case "changes_approved_anon":
            prRedirect = body.pull_request.html_url;
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;

            content = `📝 @${body.review.user.login} <a href=${prRedirect}>approved changes</a>`;
            if(body.pull_request.draft){
                emoji = '⚪'
            } else {
                emoji = '🟢'
            }

            match = body.review.body.trim().toLowerCase().match("@gitmo relay");
            if(match !== null){
                if (match[0] === "@gitmo relay") {
                    try {
                        contentRelayed = await parseGitmoAuthor(body.sender.login, body.review.body);
                        relayFlag = true;
                    } catch (error) {
                        return ({
                            status: '500'
                        });
                    }
                }
            }
            break;
        case "commented":
            prRedirect = body.pull_request.html_url;
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;

            content = `<bc-attachment sgid=${sgid}></bc-attachment> <a href=${prRedirect}> wrote a review comment</a>`;
            if(body.pull_request.draft){
                emoji = '⚪'
            } else {
                emoji = '🟢'
            }

            match = body.review.body.trim().toLowerCase().match("@gitmo relay");
            if(match !== null){
                if (match[0] === "@gitmo relay") {
                    try {
                        contentRelayed = await parseGitmoAuthor(body.sender.login, body.review.body);
                        relayFlag = true;
                    } catch (error) {
                        return ({
                            status: '500'
                        });
                    }
                }
            }
            break;
        case "commented_anon":
            prRedirect = body.pull_request.html_url
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;

            content = `${body.review.user.login} <a href=${prRedirect}> wrote a review comment</a>`;
            if(body.pull_request.draft){
                emoji = '⚪'
            } else {
                emoji = '🟢'
            }

            match = body.review.body.trim().toLowerCase().match("@gitmo relay");
            if(match !== null){
                if (match[0] === "@gitmo relay") {
                    try {
                        contentRelayed = await parseGitmoAuthor(body.sender.login, body.review.body);
                        relayFlag = true;
                    } catch (error) {
                        return ({
                            status: '500'
                        });
                    }
                }
            }
            break;
        case "created":
            prRedirect = body.issue.pull_request.html_url
            console.log(body.issue.number);
            prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(body.issue.number)}</a></li><li>Assignees: ${assigneesGithub}</li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;
            summary = prSummary;
            // Gitmo Relay PR comment
            try {
                content = await parseGitmoAuthor(body.sender.login, body.comment.body);
            } catch (error) {
                return ({
                    status: '500'
                });
            }
            break;
    }
    // Send basecamp comment if not review requested (that is handled inside the switch)
    if (!reviewRequested && !assigned && !mergeFlag && !unassigned) {

        

        
        try {

            if (assigneesGithub === "" && revieweeGithub === ""){
                prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li>${descriptionDivider}</ul>`;          
                summary = prSummary;
            } else if (assigneesGithub === "" && revieweeGithub !== ""){
                prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Reviewers: ${revieweeGithub}</li>${descriptionDivider}</ul>`;          
                summary = prSummary;
            } else if (revieweeGithub === "" && assigneesGithub !== ""){
                prSummary = `<div><strong>PR Summary</strong></div><ul><li><a href=${prRedirect}>Pull Request #${String(number)}</a></li><li>Assignees: ${assigneesGithub}</li>${descriptionDivider}</ul>`;
                summary = prSummary;
            }
            await basecampComment.basecampComment(basecampIDs, content, options);
            await basecampComment.basecampUpdate(basecampIDs, flag, emoji, summary, options);
            await basecampComment.basecampKanbanCard(basecampIDs, listName);

            if(relayFlag){
                await basecampComment.basecampComment(basecampIDs, contentRelayed, options)
            }
        } catch (error) {
            return ({
                status: '500' + error
            }); 
        }
    }
    return ({
        status: '200'
    })
}

exports.githubHookHandler = githubHookHandler;