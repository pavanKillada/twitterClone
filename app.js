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
      response.send("User Created Successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const findUser = `select * from user where username = "${username}";`;
  const dbReply = await db.get(findUser);
  if (username === undefined) {
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
    const query = `select username,tweet,date_time from (follower join user on user.user_id = following_user_id) join tweet on following_user_id = tweet.user_id order by date_time DESC limit 4;`;
    const dbReply = await db.all(query);
    response.send(dbReply);
  }
);

app.get("/user/following/", authenticationToken, async (request, response) => {
  const query = `select name from user inner join follower on user_id = following_user_id;`;
  const dbReply = await db.all(query);
  response.send(dbReply);
});

app.get("/user/followers/", authenticationToken, async (request, response) => {
  const query = `select name from user inner join follower on user_id = follower_user_id;`;
  const dbReply = await db.all(query);
  response.send(dbReply);
});

app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { tweetId } = request.params;
  const query = `select tweet,count(like.tweet_id) as likes, count(reply.tweet_id) as replies,tweet.date_time as dateTime from follower inner join tweet on following_user_id = tweet.user_id inner join reply on reply.tweet_id = tweet.tweet_id inner join like on like.tweet_id = tweet.tweet_id where tweet.tweet_id = ${tweetId};`;
  const dbReply = await db.all(query);
  response.send(dbReply);
});
