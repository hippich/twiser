var Client = require('../index');

var client = new Client({
    username: process.env.TWITTER_USERNAME,
    password: process.env.TWITTER_PASSWORD
});

var api = client.api;

api.setNewPassword('qwerty123')
   .logout()
   .setNewPassword(process.env.TWITTER_PASSWORD)
   .shutdown();
