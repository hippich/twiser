/* eslint no-space-before-semi:0 */
var Client = require('../index');

var client = new Client({
    username: process.env.TWITTER_USERNAME,
    password: process.env.TWITTER_PASSWORD
});

var api = client.api;

var origProfile;

api
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
   .setNewPassword('qwerty123')
   .logout()
   .setNewPassword(process.env.TWITTER_PASSWORD)
;
