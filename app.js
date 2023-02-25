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
    let query = `select tweet,count(like.tweet_id) as likes,count(reply.tweet_id) as replies,tweet.date_time as dateTime from (tweet inner join like on tweet.tweet_id = like.tweet_id) as TL inner join reply on TL.tweet_id = reply.tweet_id where tweet.user_id = ${userId};`;
    let dbReply = await db.get(query);
    response.send(dbReply);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
