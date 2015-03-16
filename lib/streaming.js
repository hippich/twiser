/* eslint no-underscore-dangle: 0 */
var debug = require('debug')('twiser-streaming');
var _ = require('lodash');

var Tweet = require('./tweet');

// Streaming
// =========
//
// When you ask to stream tweets from specific URL, new tab is opened with this URL.
// Every 15 seconds Stream Cycle is run to iterate over all streaming tabs, and fetch
// all tweets from these. Then check if particular tweet is likely new, and call
// streaming callback with this tweet. Important - there is no guarantee you will
// particular tweet only once, so if you code requeres never to process same tweet
// again, you need to implement some sort of storage of seen tweets in your code.
//

module.exports = {
    currentStreams: {},
    streamingInterval: false,

    // **Streaming**
    //
    // This method allows to stream tweets from `streamable` pages.
    // `Streamable` pages include: logged in home page, Discover page and Search results page.
    //
    // Currently only callback can be specified in `options`:
    //
    //       client.stream('https://twitter.com/search?f=realtime&q=js&src=typd', {
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

        if (! options) {
            options = {};
        }

        // We always require cb
        if (! options.cb) {
            options.cb = function(tweet, stream) {
                console.log('Tweet: %j. Stream: %s', tweet, stream.url);
            };
        }

        // If streaming record with this URL already exists, just add additional callback into cb array
        if (this.currentStreams[ url ]) {
            this.currentStreams[ url ].cb.push( options.cb );
            this.resumeStream();
            return;
        }

        this.api.newWindowWithId(url, url, '', function(err, res) {
            if (err || !res) {
                return;
            }

            var windowHandleId = res.value;

            debug("Openned new window %s for url %s", windowHandleId, url);

            // Before streaming from this page, remove current tweets from it,
            // so only new ones are streamed.
            if (options.onlyNew) {
                this.waitFor('#content-main-heading')
                    .execute('$("li.stream-item").remove();');
            }

            var cb = options.cb;
            delete options.cb;

            var stream = _.extend({
                id  : windowHandleId,
                cb  : [ cb ],
                url : url
            }, options);

            client.currentStreams[ url ] = stream;
        });

        this.resumeStream();
    },

    // **Stream Direct Messages**
    //
    // Special case of streaming.
    streamDirectMessages: function(options) {
    },

    // This function used internally.
    //
    // This function run on each streaming cycle. Scans all streaming tabs, and runs callback for each
    // `new-ish` tweet. 
    _streamCycle: function() {
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
                        stream.cb.forEach(function(cb) {
                            cb.call(client, tweet, stream);
                        });
                    });
                })
                .execute('$("li.stream-item").remove();');
        }.bind(this));
    },

    // **stopStreaming**
    //
    // Stops streaming for particular URL. It will find tab where this URL is opened,
    // close this tab and also remove reference to it from array of URL to scan
    // on each Stream Cycle.
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

    // **stopStreamingAll**
    //
    // This will iterate over all URLs and stop streaming for each one.
    stopStreamingAll: function() {
        Object.keys( this.currentStreams ).forEach(function(url) {
            this.stopStreaming(url);
        }.bind(this));

        this.pauseStream();
    },

    // **Pause streaming**
    //
    // If you need to react on tweet, update account or do something else, you need to pause streaming.
    // Calling `.pauseStream` will switch focus to `main` tab, so no streaming tabs affected.
    //
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
    //
    resumeStream: function() {
        if (! this.streamingInterval) {
            debug('Resuming streaming.');
            this._streamCycle();
            this.streamingInterval = setInterval(this._streamCycle.bind(this), 15000);
        }
    }
};
