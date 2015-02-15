/* eslint no-space-before-semi:0, camelcase: 0 */
var Client = require('../index');
var path = require('path');

var client = new Client({
    username: process.env.TWITTER_USERNAME,
    password: process.env.TWITTER_PASSWORD
});

var api = client.api;

var origProfile, testTweetId, testReplyId;

api
   .switchTo('streamHomePage')
   .changeNotificationsSettings({ send_favorited_email: false })
   .changeNotificationsSettings({ send_favorited_email: true })
   .turnOffEmailNotifications()
   .turnOnEmailNotifications()
   .postUpdate({
       post  : 'Something to test ' + Math.random(),
       image : path.resolve(__dirname, 'test.jpg')
   }, function(err, id) {
       if (err) { throw err; }
       testTweetId = id;
   })
   .call(function() {
       return api.postUpdate({
           post    : 'Something to test reply ' + Math.random(),
           inreply : testTweetId
       }, function(err, id) {
           if (err) { throw err; }
           testReplyId = id;
       });
   })
   .call(function() {
       return api.deleteTweet(testReplyId)
                 .deleteTweet(testTweetId);
   })
   .getProfileInfo(function(err, res) {
       if (err) {
           throw err;
       }

       origProfile = res;
   })
   .editProfile()
   .setProfileInfo({ name: 'Something' })
   .saveProfile()
   .editProfile()
   .call(function() {
       this.setProfileInfo(origProfile);
   })
   .saveProfile()
   .setNewPassword('qwerty123456')
   .logout()
   .setNewPassword(process.env.TWITTER_PASSWORD)
;
