Twiser - Twitter API via Selenium
=================================

This library provides access to twitter (post/stream/update account/etc) functionality via real browser
driven by Selenium Webdriver. API built on top of <a href="http://webdriver.io/">WebdriverIO</a> library.

### Installation

       npm install twiser --save

### Documentation

<a href="http://hippich.github.io/twiser/docs/index.html">Annotated source code</a>

### Sample usage:

       var Client = require('twiser');

       var client = new Client({
         username: 'joe',
         password: 'passx123'
       });

       client.api.login()
                 .setNewPassword('qwe123qwe')
                 .url('https://twitter.com/search?f=realtime&q=football&src=typd');

       client.stream(function(tweet) {
         console.log(tweet.text);
       });

### Running tests

Currently tests are simple scripts using library, not formal Mocha tests yet. To run these you will need
to provide twitter username and password via environment variables `TWITTER_USERNAME` and `TWITTER_PASSWORD`.

Basic test:

       DEBUG=* TWITTER_USERNAME=johndoe TWITTER_PASSWORD=password1 node test/basic.js

Streaming test:

       DEBUG=* TWITTER_USERNAME=johndoe TWITTER_PASSWORD=password1 node test/streaming.js

### Selenium webdriver

For operation selenium webdriver need to be running, this library does not handle this for you. Easiest
way to try it - download precompiled Selenium Server Standalone and run in separate terminal window:

       java -jar selenium-server-standalone-2.43.1.jar

There are ways to make it work inside docker container, as soon as I figure that out, I will add documentation
for it :)
