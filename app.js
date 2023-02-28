const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const filePath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());
module.exports = app;
let db;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: filePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server running at http://localhost:3000")
    );
  } catch (e) {
    console.log(`Db error ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticationToken = async (request, response, next) => {
  let jwtToken;
  let authToken = request.headers["authorization"];
  if (authToken !== undefined) {
    jwtToken = authToken.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const findUser = `select * from user where username = "${username}";`;
  const dbReply = await db.get(findUser);
  if (dbReply !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const postQuery = `insert into user(username,password,name,gender) values("${username}","${hashedPassword}","${name}","${gender}");`;
      await db.run(postQuery);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const findUser = `select * from user where username = "${username}";`;
  const dbReply = await db.get(findUser);
  if (dbReply === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordSame = await bcrypt.compare(password, dbReply.password);
    if (isPasswordSame === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      let payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken: jwtToken });
    }
  }
});

app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `select user_id as userId from user where username = "${username}";`;
    const { userId } = await db.get(getUserIdQuery);
    const query = `SELECT
    user.username, tweet.tweet, tweet.date_time AS dateTime
  FROM
    follower
  INNER JOIN tweet
    ON follower.following_user_id = tweet.user_id
  INNER JOIN user
    ON tweet.user_id = user.user_id
  WHERE
    follower.follower_user_id = ${userId}
  ORDER BY
    tweet.date_time DESC
  LIMIT 4;`;
    const dbReply = await db.all(query);
    response.send(dbReply);
  }
);

app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select user_id as userId from user where username = "${username}";`;
  const { userId } = await db.get(getUserIdQuery);
  const query = `select name from user join follower on user_id = following_user_id where follower_user_id = ${userId};`;
  const dbReply = await db.all(query);
  response.send(dbReply);
});

app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select user_id as userId from user where username = "${username}";`;
  const { userId } = await db.get(getUserIdQuery);
  const query = `select name from user join follower on user_id = follower_user_id where following_user_id = ${userId};`;
  const dbReply = await db.all(query);
  response.send(dbReply);
});

app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select user_id as userId from user where username = "${username}";`;
  const { userId } = await db.get(getUserIdQuery);
  const { tweetId } = request.params;
  const tweetQuery = `select * from tweet where tweet_id = ${tweetId};`;
  const tweetResult = await db.get(tweetQuery);
  const userFollowerQuery = `select * from follower inner join user on user_id = following_user_id where follower_user_id = ${userId};`;
  const followerReply = await db.all(userFollowerQuery);
  if (
    followerReply.some((item) => item.following_user_id === tweetResult.user_id)
  ) {
    let likesQuery = `select count(like_id) as likes from like where tweet_id = ${tweetId} group by tweet_id;`;
    let replyQuery = `select count(reply_id) as replies from reply where tweet_id = ${tweetId} group by tweet_id;`;
    let likesReply = await db.get(likesQuery);
    let replyReply = await db.get(replyQuery);
    response.send({
      tweet: tweetResult.tweet,
      likes: likesReply.likes,
      replies: replyReply.replies,
      dateTime: tweetResult.date_time,
    });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `select user_id as userId from user where username = "${username}";`;
    const { userId } = await db.get(getUserIdQuery);
    const { tweetId } = request.params;
    const tweetQuery = `select * from tweet where tweet_id = ${tweetId};`;
    const tweetResult = await db.get(tweetQuery);
    const userFollowerQuery = `select * from follower inner join user on user_id = following_user_id where follower_user_id = ${userId};`;
    const followerReply = await db.all(userFollowerQuery);
    if (
      followerReply.some(
        (item) => item.following_user_id === tweetResult.user_id
      )
    ) {
      let likesQuery = `select username from user join like on user.user_id = like.user_id where tweet_id = ${tweetId};`;
      let likesReply = await db.get(likesQuery);
      let likesArray = likesReply.map((obj) => obj.username);
      console.log({ likes: likesArray });

      response.send({
        likes: likesArray,
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `select user_id as userId from user where username = "${username}";`;
    const { userId } = await db.get(getUserIdQuery);
    const { tweetId } = request.params;
    const tweetQuery = `select * from tweet where tweet_id = ${tweetId};`;
    const tweetResult = await db.get(tweetQuery);
    const userFollowerQuery = `select * from follower inner join user on user_id = following_user_id where follower_user_id = ${userId};`;
    const followerReply = await db.all(userFollowerQuery);
    if (
      followerReply.some(
        (item) => item.following_user_id === tweetResult.user_id
      )
    ) {
      let repliesQuery = `select name, reply from user join reply on user.user_id = reply.user_id where reply.tweet_id = ${tweetId};`;
      let repliesReply = await db.get(repliesQuery);
      let repliesArray = repliesReply.map((obj) => {
        return {
          name: obj.name,
          reply: obj.reply,
        };
      });
      response.send({
        replies: repliesArray,
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select user_id as userId from user where username = "${username}";`;
  const { userId } = await db.get(getUserIdQuery);
  const tweetQuery = `select tweet,(select count(like_id) from like where tweet_id = tweet.tweet_id) as likes,(select count(reply_id) from reply where tweet_id = tweet.tweet_id) as replies,tweet.date_time as dateTime from tweet where tweet.user_id = ${userId};`;
  const dbReply = await db.all(tweetQuery);
  response.send(dbReply);
});

app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const getUserIdQuery = `select user_id as userId from user where username = "${username}";`;
  const { userId } = await db.get(getUserIdQuery);
  const postQuery = `insert into tweet(tweet,user_id) values("${tweet}",${userId});`;
  await db.run(postQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const { tweet } = request.body;
    const getUserIdQuery = `select user_id as userId from user where username = "${username}";`;
    const { userId } = await db.get(getUserIdQuery);
    const { tweetId } = request.params;
    const tweetQuery = `select * from tweet where tweet_id = ${tweetId};`;
    const tweetResult = await db.get(tweetQuery);
    const userTweetQuery = `select * from tweet where user_id = ${userId};`;
    const userTweetReply = await db.all(userTweetQuery);
    if (userTweetReply.some((item) => item.user_id === tweetResult.user_id)) {
      let deleteQuery = `delete from tweet where tweet_id = ${tweetId};`;
      await db.get(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
