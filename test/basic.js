var Api = require('../index');

var api = new Api({
    username: process.env.TWITTER_USERNAME,
    password: process.env.TWITTER_PASSWORD
});

api.setNewPassword('qwerty123')
   .call(function() {
       api.logout();
   })
   .call(function() {
       api.setNewPassword(process.env.TWITTER_PASSWORD);
   })
   .call(function() {
       api.shutdown();
   });
