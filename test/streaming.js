/* eslint no-space-before-semi:0, camelcase: 0, no-process-exit: 0 */
var Client = require('../lib/index');
var fs = require('fs');

if (!process.env.TWITTER_USERNAME || !process.env.TWITTER_PASSWORD) {
    throw new Error('TWITTER_USERNAME and TWITTER_PASSWORD env variables are required.');
}

var client = new Client({
    username: process.env.TWITTER_USERNAME,
    password: process.env.TWITTER_PASSWORD
});

client.stream('https://twitter.com/search?f=realtime&q=js&src=typd');
client.stream('https://twitter.com/search?f=realtime&q=php&src=typd');
client.stream('https://twitter.com/search?f=realtime&q=java&src=typd');

setTimeout(function() {
    client.pauseStream();
    console.log('paused');
    client.api.login();
    client.api.logout();
}, 40000);

setTimeout(function() {
    client.resumeStream();
    console.log('resumed');
}, 60000);

setTimeout(function() {
    client.stopStreamingAll();
    client.api.shutdown();
    console.log('stopped');
}, 120000);

process.on('uncaughtException', function (err) {
    console.log(err.stack);

    client.api.saveScreenshot('./exception.png')
              .source('body', function(err, res) {
                  if (err) {
                      console.log(err);
                  }

                  fs.writeFileSync('./exception.html', res.value);
              })
              .call(function() {
                  process.exit(1);
              });
});
