// This file sends Basecamp API calls

const Sentry = require("@sentry/node");
const { Account } = require("aws-sdk");
const axios = require('axios').default;
const api = process.env.API;
const tracked = process.env.TRACKED;
const tracked_api_token = process.env.TRACKED_API_TOKEN;
const tracked_email = process.env.TRACKED_EMAIL;
const options = {
    headers: {
        'Authorization': `Bearer ${process.env.DEFAULT_AUTH_TOKEN}`,
        'User-Agent': 'Gitmo (sshannon237@gmail.com)',
        'Content-Type': 'application/json',
    }
};
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
let accessToken = {};


// Send custom comment(s) to specific task
const basecampComment = async (IDs, content, options) => {
    try {
        for (const id of IDs) {
            if (id.isCard) {
                await axios.post(`${api}/buckets/${id.projectId}/recordings/${id.cardId}/comments.json`, { content }, options);
            } else {
                await axios.post(`${api}/buckets/${id.projectId}/recordings/${id.todoId}/comments.json`, { content }, options);
            }
        }
    } catch (err) {
        throw "Basecamp comment api call failed"
    }
}

// Update to-do title
const basecampUpdate = async (IDs, qaTesting, emoji, prSummary, options) => {
    try {
        for (const id of IDs) {
            let list;
            let title;
            let emojiTitle;
            let assigneeIDs = [];
            let subscriberIDs = [];

            if (id.isCard) {
                list = await basecampGetCard(id, options)

                list.data.assignees?.forEach(assign => {
                    assigneeIDs.push(assign.id)
                });

                if (list.data.title.charCodeAt(0) == "55357") {
                    title = list.data.title.slice(2)
                    let trimmedTitle = title.trim()
                    emojiTitle = emoji +" "+ trimmedTitle
                } else if (list.data.title.charCodeAt(0) == "9898"){
                    title = list.data.title.slice(1)
                    let trimmedTitle = title.trim()
                    emojiTitle = emoji +" "+ trimmedTitle
                } else {
                    emojiTitle = emoji +" "+ list.data.title
                }

                await axios.put(`${api}/buckets/${id.projectId}/card_tables/cards/${id.cardId}.json`, {
                'title': emojiTitle, 
                'content': list.data.content,
                'due_on': list.data.due_on,
                'assignee_ids': assigneeIDs }, options)

            } else {
                list = await basecampGetToDo(id, options)

                list.data.assignees?.forEach(assign => {
                    assigneeIDs.push(assign.id)
                });

                if (qaTesting === 1){
                    assigneeIDs.push(process.env.QA_BASECAMP_ID)
                }

                list.data.completion_subscribers?.forEach(assign => {
                    subscriberIDs.push(assign.id)
                });
                
                if (list.data.content.charCodeAt(0) == "55357") {
                    title = list.data.content.slice(2)
                    let trimmedTitle = title.trim()
                    emojiTitle = emoji +" "+ trimmedTitle
                } else if (list.data.content.charCodeAt(0) == "9898"){
                    title = list.data.content.slice(1)
                    let trimmedTitle = title.trim()
                    emojiTitle = emoji +" "+ trimmedTitle
                } else {
                    emojiTitle = emoji +" "+ list.data.content
                }

                if(emoji === "assignee") {
                    emojiTitle = list.data.content;
                }

                let descriptionHolder = list.data.description.replace(/\r?\n|\r/, "").split(`______________________`)

                if(descriptionHolder.length === 1){
                    descriptionHolder[1] = descriptionHolder[0];
                }
                                                
                descriptionHolder[0] = prSummary + "\n"

                await axios.put(`${api}/buckets/${id.projectId}/todos/${id.todoId}.json`, { 
                'content': emojiTitle, 
                'description': descriptionHolder[0] + descriptionHolder[1], 
                'assignee_ids': assigneeIDs, 
                'notify': true,
                'completion_subscriber_ids': subscriberIDs,
                'due_on': list.data.due_on, 
                'starts_on': list.data.starts_on 
                }, options)
            }            
        }
    }  catch (err) {
        throw  "Basecamp update api call failed"
    }
}


const basecampGetToDo = async (IDs, options) => {
    let info;
    try {
        info = await axios.get(`${api}/buckets/${IDs.projectId}/todos/${IDs.todoId}.json`, options)
    } catch (err) {
        throw "Basecamp get to-do api call failed"
    }
    return info;
}

const basecampGetCard = async (IDs, options) => {
    let info;
    try {
        info = await axios.get(`${api}/buckets/${IDs.projectId}/card_tables/cards/${IDs.cardId}.json`, options)
    } catch (err) {
        throw "Basecamp get card api call failed"
    }
    return info;
}

const basecampKanbanCard = async (IDs, listName) => {
    try {
        for (const id of IDs) {
            if (!id.isCard) {
                await axios.put(`${tracked}/projects/${id.projectId}/todos/${id.todoId}?api_token=${tracked_api_token}&email_address=${tracked_email}&new_position=1&list_name=${listName}`)
            }
        }
    } catch (err) {
        throw "Basecamp get card api call failed"
    }
}

const basecampGetToDoLabel = async(IDs) => {
    let labels;
    try {
        labels = await axios.get(`${tracked}/projects/${IDs.projectId}/labels/todos/${IDs.todoId}?api_token=${tracked_api_token}&email_address=${tracked_email}`)
    } catch (error) {
        throw "Tracked api call failed for labels"
    }
    return labels;
}

const basecampUpdateToDoQA = async (IDs, emoji, desc, list, options) => {
    let title;
    let emojiTitle;
    let assigneeIDs = [];
    let subscriberIDs = [];

    list.data.assignees?.forEach(assign => {
        assigneeIDs.push(assign.id)
    });

    list.data.completion_subscribers?.forEach(assign => {
        subscriberIDs.push(assign.id)
    });
    
    if (list.data.content.charCodeAt(0) == "55357") {
        title = list.data.content.slice(2)
        let trimmedTitle = title.trim()
        emojiTitle = emoji +" "+ trimmedTitle
    } else if (list.data.content.charCodeAt(0) == "9898"){
        title = list.data.content.slice(1)
        let trimmedTitle = title.trim()
        emojiTitle = emoji +" "+ trimmedTitle
    } else {
        emojiTitle = emoji +" "+ list.data.content
    }

    await axios.put(`${api}/buckets/${IDs[0].projectId}/todos/${IDs[0].todoId}.json`, { 
    'content': emojiTitle, 
    'description': desc,
    'assignee_ids': assigneeIDs, 
    'notify': true,
    'completion_subscriber_ids': subscriberIDs,
    'due_on': list.data.due_on, 
    'starts_on': list.data.starts_on 
    }, options)
}



// Get initial Basecamp auth token and refresh token
// Note: Not currently in use, for developers in future to switch to a new Basecamp project
const getAccessTokenFirstTime = async () => {
    try {
        const res = await axios.post('https://launchpad.37signals.com/authorization/token?type=web_server&client_id=675df7f3cd879699ac8a27137cb51553a522afcf&redirect_uri=http://localhost:3000&client_secret=6258ce7327095485a2558482eb6c2c6880569aa7&code=6436f77e');
    } catch (err) {
        Sentry.captureException(err);
        console.log(err);
    }
}

// Get Basecamp access token
const getAccessToken = async () => {
    if (!accessToken.expires_at || accessToken.expires_at < new Date().getTime()) {
        try {
            const res = await axios.post(`https://launchpad.37signals.com/authorization/token?type=refresh&refresh_token=${REFRESH_TOKEN}&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&client_secret=${CLIENT_SECRET}`);
            accessToken.access_token = res.data.access_token;
            accessToken.expires_at = res.data.expires_in + new Date().getTime();
            return accessToken.access_token;
        } catch (err) {
            return "FAILED"
        }
    } else {
        return accessToken.access_token;
    }
}

exports.getAccessToken = getAccessToken;
exports.basecampComment = basecampComment;
exports.basecampUpdate = basecampUpdate;
exports.basecampKanbanCard = basecampKanbanCard;
exports.basecampGetToDo = basecampGetToDo;
exports.basecampGetToDoLabel = basecampGetToDoLabel;
exports.options = options;
exports.getAccessTokenFirstTime = getAccessTokenFirstTime;
exports.basecampUpdateToDoQA = basecampUpdateToDoQA;
