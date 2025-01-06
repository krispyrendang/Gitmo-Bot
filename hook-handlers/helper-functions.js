var url = require('url');
const { getSGIDFromDB } = require("../database");
const parseString = require('xml2js').parseString;

// Return list of IDs for each Basecamp todo link in description provided on github
const parseTodoLinkGH = (desc) => {
    let Ids = [];
    if (!desc) return Ids;

    var bascampTaskLink = desc.split('##')[1];
    var matchesBasecampTL = bascampTaskLink.trim().match(/\bhttps?:\/\/\S+/gi);
    matchesBasecampTL?.forEach(link => {
        if (link.includes("card_tables")) {
            Ids.push(parseCardTableGH(link, false));
        } else {
            var q = url.parse(link.trim(), true);
            let projectId = q.pathname.split('/')[3];
            let todoId = q.pathname.split('/')[5];
            Ids.push({ 'projectId': projectId, 'todoId': todoId, 'isDependent': false, 'isCard': false})
        }
        
    });

    var dependentTaskLink = desc.split('##')[2];
    var matchesDependentTL = dependentTaskLink.trim().match(/\bhttps?:\/\/\S+/gi);
    if (!matchesDependentTL) return (Ids);
    matchesDependentTL?.forEach(link => {
        if (link.includes("card_tables")) {
            Ids.push(parseCardTableGH(link, true));
        } else {
            var q = url.parse(link.trim(), true);
            let projectId = q.pathname.split('/')[3];
            let todoId = q.pathname.split('/')[5];
            Ids.push({ 'projectId': projectId, 'todoId': todoId, 'isDependent': true, 'isCard': false})
        }
        
    });

    return (Ids);
}

// gets the cards projectID and cardID and returns it as a dictionary
const parseCardTableGH = (link, isDependent) => {
    let Id = {};
    if (!link) return Id;

    var q = url.parse(link.trim(), true);
    let projectId = q.pathname.split('/')[3];
    let cardId = q.pathname.split('/')[6]

    if (isDependent) {
            Id = {'projectId': projectId, 'cardId': cardId, 'isDependent': true, 'isCard': true}
    } else {
        Id = {'projectId': projectId, 'cardId': cardId, 'isDependent': false, 'isCard': true}
    }

    return (Id);
}

//Return list of IDs for each Basecamp todo link
const parseTodoLinkBC = (desc) => {
    let Ids = [];
    if (!desc) return Ids;
    var matches = desc.trim().match(/\bhttps?:\/\/\S+/gi);
    matches?.forEach(link => {
        var q = url.parse(link.trim(), true);
        let projectId = q.pathname.split('/')[3];
        let todoId = q.pathname.split('/')[5];
        Ids.push({ 'projectId': projectId, 'todoId': todoId, 'isDependent': false})
    });

    return (Ids);
}

//Return list of IDs for each Basecamp todo link
const parseCardLink = (desc) => {
    let Ids = [];
    if (!desc) return Ids;
    var matches = desc.trim().match(/\bhttps?:\/\/\S+/gi);
    matches?.forEach(link => {
        var q = url.parse(link.trim(), true);
        let projectId = q.pathname.split('/')[3];
        let cardId = q.pathname.split('/')[6];
        Ids.push({ 'projectId': projectId, 'cardID': cardId, 'isDependent': false})
    });

    return (Ids);
}

// Return @gitmo relay parsed message content
const parseGitmoMention = async (str) => {
    // Slice 2 for preceding @Gitmo and relay
    if (str.toLowerCase().includes("@gitmo relay")) {
        let parsedString = str.substr(str.toLowerCase().search("@gitmo relay") + 12, str.length);

        let mentions = [...parsedString.matchAll(/@[^\s]+/g)].map((v) => v[0]);
        for (var i = 0; i < mentions.length; i++) {
            let reviewersGithub = mentions[i].substring(1);
            let reviewerBasecampData;
            try {
                reviewerBasecampData = await getSGIDFromDB(reviewersGithub);
            } catch (error) {
                throw 'Not a Gitmo comment';
            }
            try {
                if (("Item" in reviewerBasecampData)) {
                    let reviewerSgid = reviewerBasecampData.Item.basecamp_sgid.S;
                    parsedString = parsedString.replace(mentions[i], `<bc-attachment sgid=${reviewerSgid}></bc-attachment>`);
                }
            } catch (error) {
                throw 'Not a Gitmo comment';
            }
        }
        return parsedString;
    }
    else {
        throw 'Not a Gitmo comment';
    }
}

// Return @gitmo relay parsed author
const parseGitmoAuthor = async (login, body) => {
    let reviewersGithub = login;
    let reviewerBasecampData;
    try {
        reviewerBasecampData = await getSGIDFromDB(reviewersGithub);
    } catch (error) {
        throw 'Not a Gitmo comment';
    }
    try {
        if (!("Item" in reviewerBasecampData)) {
            return `@${reviewersGithub} said:<br><blockquote>${await parseGitmoMention(body)}</blockquote>`;
        } else {
            let reviewerSgid = reviewerBasecampData.Item.basecamp_sgid.S;
            return `<bc-attachment sgid=${reviewerSgid}></bc-attachment> said:<br><blockquote>${await parseGitmoMention(body)}</blockquote>`;
        }
    } catch (error) {
        throw 'Not a Gitmo comment';
    }
}

// Checks if @Gitmo is the first word in the comment
const checkGitmoCommand = (payload) => {
    var commentSplit = payload.split(" ")
    if (commentSplit[0] === "<div><bc-attachment") {
        return true
    }
    return false
}

// Return promise of parsed Basecamp comment data
const parseBasecampComment = (payload) => {    
    return new Promise((resolve, reject) => {
        parseString(payload.replace(/<br>/g, ""), (err, result) => {
            if (result === undefined) {
                reject("Ignore");
                return;
            }
            const sgids = result.div["bc-attachment"]?.map(item => item.$.sgid); // array of SGID strings
            const commandWithoutSGIDs = result.div._?.trim();
            var words = commandWithoutSGIDs ? commandWithoutSGIDs.split(/\s+/) : []; // array of words in command without the @ mentions
            resolve({ sgids, words });
        });
    });
}

module.exports.parseTodoLinkGH = parseTodoLinkGH;
module.exports.parseTodoLinkBC = parseTodoLinkBC;
module.exports.parseCardLink = parseCardLink;
module.exports.parseGitmoMention = parseGitmoMention;
module.exports.parseGitmoAuthor = parseGitmoAuthor;
module.exports.parseBasecampComment = parseBasecampComment;
module.exports.checkGitmoCommand = checkGitmoCommand;