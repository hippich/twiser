var debug = require('debug')('twiser-streaming');
var _ = require('lodash');

var Tweet = require('./tweet');

var streaming = module.exports = {};

// **Streaming**
//
// This method allows to stream tweets in realtime while on `streamable` pages.
// `Streamable` pages include: logged in home page, Discover page and Search results page.
//
// You need first to open `streamable` page and then call `client.stream(opts);`. Notice,
// that this is not `.api` method, but rather `client` method.
//
// Following options are available:
//
//       client.api.url('https://twitter.com/search?f=realtime&q=js&src=typd');
//       client.stream({
//         timeout: 10000, // Optional, interval in ms between check for new tweets. Default: 15000 (15 seconds)
//                         // There is no reason to make it too small, as new tweets appear about once every 30 seconds.
//         cb: function(tweet) { // This callback will be called with new tweet
//           console.log(tweet.user.id);
//         }
//       });
//
// Here is example of tweet object:
//
//         {
//             "id_str": "567646576014008320",
//             "id": "567646576014008320",
//             "created_at": "2015-02-17T11:27:44.000Z",
//             "text": "Java vs. Node.js: An epic battle for developer mind share http://ift.tt/1Az9Z4l  ===== http://androidanalytic.com ",
//             "html": "Java vs. Node.<strong>js</strong>: An epic battle for developer mind share <a href=\"http://t.co/6eLpH0178e\" rel=\"nofollow\" dir=\"ltr\" data-expanded-url=\"http://ift.tt/1Az9Z4l\" class=\"twitter-timeline-link\" target=\"_blank\" title=\"http://ift.tt/1Az9Z4l\"><span class=\"tco-ellipsis\"></span><span class=\"invisible\">http://</span><span class=\"js-display-url\">ift.tt/1Az9Z4l</span><span class=\"invisible\"></span><span class=\"tco-ellipsis\"><span class=\"invisible\">&#xA0;</span></span></a> ===== <a href=\"http://t.co/tOpip4QwzM\" rel=\"nofollow\" dir=\"ltr\" data-expanded-url=\"http://androidanalytic.com\" class=\"twitter-timeline-link\" target=\"_blank\" title=\"http://androidanalytic.com\"><span class=\"tco-ellipsis\"></span><span class=\"invisible\">http://</span><span class=\"js-display-url\">androidanalytic.com</span><span class=\"invisible\"></span><span class=\"tco-ellipsis\"><span class=\"invisible\">&#xA0;</span></span></a>",
//             "retweeted": false,
//             "is_reply": false,
//             "user_mentions": [""],
//             "user": {
//                 "id_str": "2780229181",
//                 "id": "2780229181",
//                 "name": "Android Analytics",
//                 "screen_name": "AndroidAnalytic",
//                 "lang": "en"
//             }
//         }
//
Client.prototype.stream = function(options) {
    this.stopStream();

    this.streaming.options = _.extend({
        timeout : 15000,
        cb      : function(tweet) { console.log('Tweet: %j', tweet); }
    }, options);

    this.streaming.status = 'running';

    this.streamCycle();
    this.streaming.streamInterval = setInterval(this.streamCycle.bind(this), this.streaming.options.timeout);
};

// This method get called to check for new tweets
Client.prototype.streamCycle = function() {
    var client = this;
    var api = this.api;

    api.isExisting('.new-tweets-bar', function(err, res) {
        if (!err && res) {
            return api.click('.new-tweets-bar');
        }
    });

    api.getHTML('.stream .stream-items .stream-item .tweet', function(err, res) {
        if (! _.isArray(res)) {
            res = [res];
        }

        res.reverse().forEach(function(item) {
            var tweet = new Tweet(item);

            if (client.streaming.seenTweetIds.indexOf(tweet.id) > -1) {
                return;
            }

            client.streaming.seenTweetIds.push( tweet.id );
            client.streaming.options.cb.call(this, tweet);
        }.bind(this));
    });
};

// **Pause streaming**
//
// If you need to react on tweet, update account or do something else, you need to pause streaming.
// Calling `.pauseStream` will open new window to keep streaming page intact.
Client.prototype.pauseStream = function() {
    this.streaming.status = 'paused';
    this.streaming.streamInterval = clearInterval(this.streaming.streamInterval);
    this.api.newWindow('about:blank', 'temp');
};

// **Resume streaming**
//
// Once you are ready to continue streaming (finished replying to a tweet for example), call `.resumeStream()`.
// This will close popup and return back to streaming page, and re-start streaming.
Client.prototype.resumeStream = function() {
    this.streaming.status = 'running';
    this.api
        .window()
        .switchTab()
        .call(function() {
            this.streamCycle();
            this.streaming.streamInterval = setInterval(this.streamCycle.bind(this), this.streaming.options.timeout);
        }.bind(this));
};

// **Stop streaming**
//
// This will stop streaming AND reset array of seen tweet ids. Next time you start streaming from the same page,
// you might see duplicate tweets.
Client.prototype.stopStream = function() {
    this.streaming.status = 'stopped';
    this.streaming.seenTweetIds = [];

    if (this.streaming.streamInterval) {
        this.streaming.streamInterval = clearInterval(this.streaming.streamInterval);
    }
};
};
