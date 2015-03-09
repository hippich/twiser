var debug = require('debug')('twiser-streaming');
var _ = require('lodash');

var Tweet = require('./tweet');

module.exports = {
    currentStreams: {},
    streamingInterval: false,

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
    stream: function(url, options) {
        var client = this;

        this.api.newWindowWithId(url, url, '', function(err, res) {
            if (err) {
                return;
            }

            var windowHandleId = res.value;

            debug("Openned new window %s for url %s", windowHandleId, url);

            var stream = _.extend({
                id   : windowHandleId,
                cb   : function(tweet, stream) {
                    console.log('Tweet: %j. Stream: %s', tweet, stream.url);
                },
                url  : url,
                seen : []
            }, options);

            client.currentStreams[ url ] = stream;
        });

        this.resumeStream();
    },

    streamCycle: function() {
        var client = this;

        Object.keys(this.currentStreams).forEach(function(url) {
            var stream = this.currentStreams[url];

            client.api
                .call(function() {
                    debug('Checking window %s for url %s', stream.id, url);
                })
                .window(stream.id)
                .getTweets(function(err, tweets) {
                    if (err) {
                        return;
                    }

                    debug('found %d tweets', tweets.length);

                    tweets.reverse().forEach(function(item) {
                        var tweet = new Tweet(item);

                        if (stream.seen.indexOf(tweet.id) > -1) {
                            return;
                        }

                        stream.seen.push( tweet.id );
                        stream.cb.call(client, tweet, stream);
                    });
                });
        }.bind(this));
    },

    stopStreaming: function(url) {
        var stream = this.currentStreams[url];

        if (! stream) {
            debug('Stream for ' + url + ' is not present.');
            return;
        }

        debug('Stopping stream for url %s', url);

        this.api.window(stream.id)
                .window(); // Close window

        delete this.currentStreams[url];

        if (Object.keys(this.currentStreams).length < 1) {
            this.pauseStream();
        }
    },

    stopStreamingAll: function() {
        Object.keys( this.currentStreams ).forEach(function(url) {
            this.stopStreaming(url);
        }.bind(this));

        this.pauseStream();
    },

    // **Pause streaming**
    //
    // If you need to react on tweet, update account or do something else, you need to pause streaming.
    // Calling `.pauseStream` will open new window to keep streaming page intact.
    pauseStream: function() {
        if (this.streamingInterval) {
            debug('Pausing streaming');
            this.streamingInterval = clearInterval(this.streamingInterval);
            this.api.window(this.mainWindowId);
        }
    },

    // **Resume streaming**
    //
    // Once you are ready to continue streaming (finished replying to a tweet for example), call `.resumeStream()`.
    // This will close popup and return back to streaming page, and re-start streaming.
    resumeStream: function() {
        if (! this.streamingInterval) {
            debug('Resuming streaming.');
            this.streamCycle();
            this.streamingInterval = setInterval(this.streamCycle.bind(this), 15000);
        }
    }
};
