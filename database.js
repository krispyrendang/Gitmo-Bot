const { basecampComment } = require("./basecamp-calls/dispatcher.js");
const { POINTS_COMMAND } = require('./hook-handlers/const.js');
const { discordHandler } = require('./hook-handlers/discord-handler.js');
var AWS = require("aws-sdk");

global.dynamodb = (global.dynamodb ? global.dynamodb : new AWS.DynamoDB({ region: 'ca-central-1' }));

// Get Basecamp username using Github username
const getSGIDFromDB = async (ghUsername) => {
  var params = {
    Key: {
      "github_username": {
        S: ghUsername
      }
    },
    TableName: process.env.TABLE_NAME
  };
  return await dynamodb.getItem(params).promise();
}

// Send Basecamp comment containing list of registered Gitmo users
function listUsersSuccessMessage(userSGIDList) {
  let usersHTML = `<ul>`;
  userSGIDList.forEach((userSGID) => usersHTML += `<li><bc-attachment sgid=${userSGID[0]}></bc-attachment> ${userSGID[1]}</li>`);
  usersHTML += `</ul>`;
  let content = `👥  <b>Sure, here are all the users:</b><br>${usersHTML}`;
  return content;
}

// Send Basecamp comment containing list of registered Gitmo users
async function listUsersPointsMessage(senderSGID, mentionedUserSGID, points, userSGIDListPoints, userSGIDListAll, commentLink, commandType) {
  let mentioned = "";
  let sender = "";
  let usersHTML = "";
  userSGIDListAll.forEach(function (userSGID) {
    sender += senderSGID == userSGID[0] ? userSGID[1] : "";
  });
  userSGIDListPoints.forEach(function (userSGID, i) {
    mentioned += mentionedUserSGID == userSGID[0] ? userSGID[1] : "";
    usersHTML += `${i + 1}. ${userSGID[2]} ${parseInt(userSGID[2]) == 1 || parseInt(userSGID[2]) == -1 ? "point" : "points"} - ${userSGID[1]}\n`
  });
  usersHTML += "";
  return `--------------------------\n${getPointsUpdatedMsg(sender, mentioned, points, commandType)}\n${commentLink}\n\n${usersHTML}\n`;
}

function getPointsUpdatedMsg(sender, mentioned, points, commandType) {
  points = parseInt(points);
  let absPoints = Math.abs(points);
  let pointsText = `${absPoints} point${absPoints == 1 ? "" : "s"}`;
  switch (commandType) {
    case POINTS_COMMAND.NO_TASK:
      return `${mentioned} didn't make a task! ${sender} took away ${pointsText}.`;
      break;
    case POINTS_COMMAND.SPELLING:
      return `${mentioned} made a spelling error! ${sender} took away ${pointsText}.`;
      break;
    default:
      if (points < 0) return `Oof! ${sender} took away ${pointsText} from ${mentioned}!`;
      return `${sender} awarded ${mentioned} ${pointsText}!`;
      break;
  }
}


// Return promise of added GitHub username + Basecamp SGDI pairing to the database
const addUserToDB = async (newGHUsername, newBasecampSGID, displayName) => {
  var params = {
    Item: {
      "github_username": {
        S: newGHUsername
      },
      "basecamp_sgid": {
        S: newBasecampSGID
      },
      "display_name": { S: displayName },
      "points": { S: "0" },
    },
    ConditionExpression: 'attribute_not_exists(github_username)',
    ReturnConsumedCapacity: process.env.CONSUMED_CAPACITY,
    TableName: process.env.TABLE_NAME
  };
  return new Promise((resolve) => {
    dynamodb.putItem(params, async function (err, data) {
      if (err) {
        if (err.code === "ConditionalCheckFailedException") {
          let content = `❌ I already have <bc-attachment sgid=${newBasecampSGID}></bc-attachment>. Did you mean someone else?`;
          resolve(content);
        } else {
          let content = `❌ Uh oh... I couldn't add <bc-attachment sgid=${newBasecampSGID}></bc-attachment> for some reason.`;
          resolve(content);
        }
      } else {
        let content = `✅ Got it! I've added <bc-attachment sgid=${newBasecampSGID}></bc-attachment>.`;
        resolve(content);
      }
    });
  })
}

// Return promise of GitHub username query (matched to provided Basecamp SGID)
const getGHUserFromDB = async (basecampSGID) => {
  const params = {
    TableName: process.env.TABLE_NAME,
    IndexName: process.env.INDEX_NAME,
    KeyConditionExpression: process.env.KEY_CONDITION,
    ExpressionAttributeValues: {
      ":basecamp_sgid": { S: basecampSGID }
    }
  };
  return new Promise((resolve, reject) => {
    dynamodb.query(params, function (err, data) {
      if (err) {
        console.log(err, err.stack);
        reject(err);
      } else {
        console.log(data);
        resolve(data);
      }
    })
  })
};

// Return promise of scan for all registered Gitmo users
const listAllUsers = async () => {
  let params = {
    TableName: process.env.TABLE_NAME
  };
  let usersList = [];
  return new Promise((resolve) => {
    dynamodb.scan(params, async function (err, data) {
      if (err) {
        console.log(err, err.stack);
        resolve('❌ Uh oh... I couldn\'t list all users for some reason.')
      } else {
        if (data.Items.length === 0) {
          let content = `😔 I don't know anybody.`;
          resolve(content);
        } else {
          data.Items.forEach((item) => usersList.push([item.basecamp_sgid.S, item.github_username.S]));
          // Sort alphabetically by GitHub username
          usersList.sort(function (user1, user2) {
            if (user1[1].toLowerCase() < user2[1].toLowerCase()) return -1
            else return 1
          });
          resolve(listUsersSuccessMessage(usersList));
        }
      }
    });
  })
};

// Return promise of deleting a specific user from the database
const deleteUserFromDB = async (delete_basecampSGID) => {
  const itemToDelete = await getGHUserFromDB(delete_basecampSGID);
  if (itemToDelete.Count !== 0) {
    const GHUserToDelete = itemToDelete.Items[0].github_username.S;
    var params = {
      Key: {
        "github_username": {
          S: GHUserToDelete,
        }
      },
      TableName: process.env.TABLE_NAME,
    };
    return new Promise((resolve) => {
      dynamodb.deleteItem(params, async function (err, data) {
        console.log(data);
        if (err) {
          console.log(err, err.stack);
          let content = `❌ Uh oh... I couldn't delete <bc-attachment sgid=${delete_basecampSGID}></bc-attachment> for some reason.`;
          resolve(content);
        } else {
          let content = `✅ Bye bye dude! <bc-attachment sgid=${delete_basecampSGID}></bc-attachment> has been deleted.`;
          resolve(content);
        }
      });
    })
  } else {
    let content = `❌ I don't know who <bc-attachment sgid=${delete_basecampSGID}></bc-attachment> is.`;
    return content;
  }
};

/** Update points
 * 
 * @returns true or false for if the function was successful
 */
const updatePoints = async (mentionedUserSGID, points) => {
  let data = await getPointsAllDB();
  let githubUsername;
  let displayName;
  data.Items.forEach((item) => {
    if (item.basecamp_sgid.S == mentionedUserSGID) {
      points += parseInt(item.points.S);
      githubUsername = item.github_username.S;
      displayName = item.display_name.S;
    }
  })
  return await updatePointsDB(githubUsername, points, mentionedUserSGID, displayName);
}

// Get all points
const getPointsAllDB = async () => {
  let params = {
    TableName: process.env.TABLE_NAME
  }
  return new Promise((resolve, reject) => {
    dynamodb.scan(params, (err, data) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(data);
      }
    })
  })

}

// Update points DynamoDB call
const updatePointsDB = async (github_username, points, mentionedUserSGID, displayName) => {
  let param = {
    TableName: process.env.TABLE_NAME,
    Item: {
      github_username: {
        S: github_username
      },
      points: {
        S: points.toString()
      },
      basecamp_sgid: {
        S: mentionedUserSGID
      },
      display_name: {
        S: displayName
      }
    }
  }
  return new Promise((res, rej) => {
    dynamodb.putItem(param, async function (err, data) {
      if (err) {
        console.log(err);
        rej(false);
      } else {
        res(true);
      }
    })
  })
}

// Reset all points to 0
const resetPoints = async () => {
  let data = await getPointsAllDB();
  let param = {
    RequestItems: {
      "users": []
    }
  }
  data.Items.forEach((item) => {
    if (item.points !== undefined) {
      item.points.S = "0"
      param.RequestItems.users.push({
        PutRequest: {
          Item: {
            github_username: { S: item.github_username.S },
            basecamp_sgid: { S: item.basecamp_sgid.S },
            display_name: { S: item.display_name.S },
            points: { S: "0" },
          },
        },
      });
    }
    console.log(JSON.stringify(param));
  })
  return new Promise((res, rej) => {
    dynamodb.batchWriteItem(param, async function (err, data) {
      if (err) {
        console.log(err);
        rej(false);
      } else {
        console.log("Success");
        res(true);
      }
    })
  })
}


// Return promise of scan for all registered Gitmo users
const getAllDiscordUserPoints = async (senderSGID, mentionedUserSGID, points, commentLink, commandType) => {
  let params = {
    TableName: process.env.TABLE_NAME
  };
  let usersListPoints = [];
  let usersListAll = [];
  return new Promise((resolve, reject) => {
    dynamodb.scan(params, async function (err, data) {
      if (err) {
        console.log(err, err.stack);
        reject(err);
      } else {
        if (data.Items.length === 0) {
          resolve(data);
        } else {
          data.Items.forEach(function (item) {
            if (item.points?.S) usersListPoints.push([item.basecamp_sgid.S, item.display_name.S, item.points.S]);
            usersListAll.push([item.basecamp_sgid.S, item.display_name.S]);
          });
          // Sort alphabetically by GitHub username
          usersListPoints.sort(function (points1, points2) {
            if (parseInt(points2[2]) < parseInt(points1[2])) return -1
            else return 1
          });
          let msg = await listUsersPointsMessage(senderSGID, mentionedUserSGID, points, usersListPoints, usersListPoints, commentLink, commandType);
          await discordHandler(msg, 'leaderboard');
          resolve(data);
        }
      }
    });
  })
};

module.exports.resetPoints = resetPoints;
module.exports.updatePoints = updatePoints;
module.exports.listAllUsers = listAllUsers;
module.exports.getSGIDFromDB = getSGIDFromDB;
module.exports.addUserToDB = addUserToDB;
module.exports.deleteUserFromDB = deleteUserFromDB;
module.exports.getAllDiscordUserPoints = getAllDiscordUserPoints;