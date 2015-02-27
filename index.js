/* eslint no-underscore-dangle: 0, handle-callback-err: 0, camelcase: 0 */
var debug = require('debug')('twiser');
var webdriverio = require('webdriverio');
var _ = require('lodash');

var Tweet = require('./tweet');

//
// **Client class**
//
// Sample usage:
//
//        var Client = require('twiser');
//
//        var client = new Client({
//          username: 'joe',
//          password: 'passx123'
//        });
//
//        client.api.login()
//                  .setNewPassword('qwe123qwe')
//                  .url('https://twitter.com/search?f=realtime&q=football&src=typd');
//
//        client.stream(function(tweet) {
//          console.log(tweet.text);
//        });
//
var Client = function(options) {
    this.options = _.extend({
        username: false,
        password: false,
        remoteOptions: {
            desiredCapabilities: {
                browser: 'chrome'
            }
        }
    }, options);

    this.streaming = {
        streamInterval : null,
        seenTweetIds   : [],
        status         : 'stopped'
    };

    var remoteOptions = _.extend({
        desiredCapabilities: {
            browser: 'chrome'
        }
    }, this.options.remoteOptions);

    var addonCommands = this.api;
    var api = this.api = webdriverio.remote(remoteOptions).init();
    this.api._client = this;

    _.forOwn(addonCommands, function(handler, command) {
        api.addCommand(command, handler);
    });
};

var api = {};

// **Login using username/password**
//
// Open /login page and try to login with supplied username/password
api.login = function(cb) {
    var client = this._client;

    if (!client.options.username || !client.options.password) {
        return cb( new Error('Login requested, but no username/password provided') );
    }

    this.url(function(err, res) {
            if (err) {
                return cb(err);
            }

            if (! res.value.match(/^https\:\/\/twitter\.com\/login/i) ) {
                return this.url('https://twitter.com/login');
            }
        })
        .title(function(err, res) {
            if (err) {
                return cb(err);
            }

            var title = res.value;

            if (title.match(/login/i)) {
                debug('Logging in with username: %s and password: %s', client.options.username, client.options.password);

                return this.setValue('#page-container .js-username-field', client.options.username)
                           .setValue('#page-container .js-password-field', client.options.password)
                           .click('#page-container button.submit');
            }
            else {
                debug('Already logged in');
            }
        })
        .url(function(err, res) {
            if (err) {
                return cb(err);
            }

            var url = res.value;

            if (url.match(/login\/error/i)) {
                return this.getText('.message-text', function(err, text) {
                    if (err) {
                        return cb(err);
                    }

                    return cb( new Error('Unable to login. Reason: ' + text) );
                });
            }

            return cb(null);
        });
};

// **Logout**
api.logout = function(cb) {
    this.url('https://twitter.com/logout')
        .click('.signout-wrapper button.primary-btn')
        .call(cb);
};

// **Change account password**
//
// Login, open password settings page, fill form to change password and press submit.
// It will automaticaly update current client's password to new one.
//
// Pass new password:
//
//     client.api.setNewPassword('asd123asd');
//
api.setNewPassword = function(newPassword, cb) {
    var client = this._client;

    debug('Changing password. Old: %s, New: %s', client.options.password, newPassword);

    this.url('https://twitter.com/settings/password')
        .title(function(err, res) {
            if (err) {
                return cb(err);
            }

            if (res.value.match(/login/i)) {
                return this.login();
            }

            if (! res.value.match(/settings/i)) {
                return cb( new Error('Not sure where I ended up :(') );
            }
        })
        .setValue('#current_password', client.options.password)
        .setValue('#user_password', newPassword)
        .setValue('#user_password_confirmation', newPassword)
        .click('#settings_save')
        .url(function(err, res) {
            if (err) {
                return cb(err);
            }

            if (res.value !== 'https://twitter.com/settings/passwords/password_reset_confirmation') {
                debug('Password did not change successfuly');

                return this
                    .getText('#settings-alert-box h4', function(err, text) {
                        debug('got text');

                        if (err) {
                            return cb(err);
                        }

                        return cb( new Error('Unable to change password: ' + text) );
                    })
                ;
            }

            this._client.options.password = newPassword;

            return cb(null);
        });
};

// **Shutdown**
//
// Call to close all browser windows. Do it before exit, as browsers will not be closed automaticaly.
api.shutdown = function(cb) {
    this.end();
    cb(null);
};

// **Open profile page**
//
// Using supplied `profile` parameter, open profile page for this user. If `profile` is not specified,
// opens own profile page.
api.goToProfile = function(profile, cb) {
    var client = this._client;

    if (! cb) {
        cb = profile;
        profile = null;
    }

    var id = profile || client.options.username;

    if (! id) {
        return cb(new Error('No username available'));
    }

    var url = 'https://twitter.com/' + id;

    debug('Checking if we are already on profile page: %s', url);

    this.url(function(err, res) {
            if (err) {
                return cb(err);
            }

            if (res.value !== url) {
                return this.url(url);
            }
        })
        .call(cb);
};

// **Edit profile**
//
// Logs in, open profile page and click `Edit` button. Used to begin changes in profile info.
api.editProfile = function(cb) {
    this.login()
        .goToProfile()
        .click('[data-scribe-element="profile_edit_button"]')
        .call(cb);
};

// **Save profile**
//
// Clicks Save button. This usually called once you are done changing profile.
api.saveProfile = function(cb) {
    this.click('.ProfilePage-saveButton')
        .getActionMessage(function(err, text) {
            if (err) { return cb(err); }

            if (text && text.indexOf('Your profile has been saved.') === -1) {
                return cb(new Error('Unable to save profile info: ' + text));
            }
        })
        .call(cb);
};

// **Get action message**
//
// If some action produce message, you can use this action to retrieve it.
api.getActionMessage = function(cb) {
    this.getText('.message-text', function(err, text) {
            if (err) { return cb(err); }

            if (text) {
                debug('Got message: %s', text);
                return cb(null, text);
            }

            cb(null);
        });
};

// **Get profile info**
//
// Return object with profile information:
//
//     "profile": {
//       "name": "John Doe",
//       "bio": "Bio line from profile",
//       "location": "London, UK",
//       "url": "https://google.com/"
//     }
//
// Sample usage:
//
//     client.api.getProfileInfo(function(err, info) {
//       console.log(info.name);
//     });
//
api.getProfileInfo = function(cb) {
    var profile = {
        name     : '',
        bio      : '',
        location : '',
        url      : ''
    };

    this.goToProfile()
        .getText('.ProfileHeaderCard-nameLink', function(err, text) {
            profile.name = text;
        })
        .getText('.ProfileHeaderCard-bio', function(err, text) {
            profile.bio = text;
        })
        .getText('.ProfileHeaderCard-locationText', function(err, text) {
            profile.location = text;
        })
        .getAttribute('.ProfileHeaderCard-urlText a', 'title', function(err, title) {
            profile.url = title;
        })
        .call(function() {
            cb(null, profile);
        });
};

// **Set profile info**
//
// Set information on user profile. Pass following object as a first parameter:
//
//     "profile": {
//       "name": "James Bond",
//       "bio": "Agent 007",
//       "location": "Paris, FR",
//       "url": ""
//     }
//
// Make sure to be on a profile page, and click 'Edit' button first.
//
// Sample usage:
//
//     client.api.login()
//     client.api.goToProfile()
//     client.api.editProfile()
//     client.api.setProfileInfo({
//       "name": "James Bond",
//       "bio": "Agent 007",
//       "location": "Paris, FR",
//       "url": ""
//     });
//     client.api.saveProfile()
//
api.setProfileInfo = function(profile, cb) {
    debug('Setting profile info: %j', profile);

    if (profile.name) {
        this.setValue('#user_name', profile.name);
    }

    if (profile.bio) {
        this.setValue('#user_description', profile.bio);
    }

    if (profile.location) {
        this.setValue('#user_location', profile.location);
    }

    if (profile.url) {
        this.setValue('#user_url', profile.url);
    }

    this.call(cb);
};

// **Post Update**
//
// Post tweet. Supply following object:
//
//      client.api.postUpdate({
//        "post": "Hello, this is my #twitter post",
//        "inreply": "2532523523523523", // Optional tweet_id of the post to reply to
//        "image": "/home/joe/images/cat.jpg" // Optional path to the image to include in the tweet
//      });
//
api.postUpdate = function(update, cb) {
    if (_.isString(update)) {
        update = {
            post: update
        };
    }

    this.login();

    var selectorPrefix = '.timeline-tweet-box form';

    if (update.inreply) {
        selectorPrefix = '.inline-reply-tweetbox';
        this.goToStatus(update.inreply);
    }


    this.click(selectorPrefix + ' .tweet-box')
        .keys(_.repeat("\b", 140))
        .keys(update.post);

    if (update.image) {
        this.chooseFile(selectorPrefix + ' .file-input[type=file]', update.image)
            .waitFor(selectorPrefix + ' .previews .preview')
            .pause(1000);
    }

    this.scroll(selectorPrefix + ' .Icon--tweet')
        .click(selectorPrefix + ' .Icon--tweet')
        .getActionMessage(function(err, text) {
            if (text && !text.match(/Your tweet.+has been sent\!/)) {
                return cb('Unable to post update: ' + text);
            }
        })
        .waitFor("//div[contains(concat(' ',normalize-space(@class),' '),' my-tweet ')]//span[contains(text(), 'now')]", 10000)
        .getAttribute('.stream-container .my-tweet', 'data-tweet-id', function(err, ids) {
            var id;

            if (err) { return cb(err); }

            if (! _.isArray(ids)) {
                id = ids;
            }
            else {
                id = ids.shift();
            }

            debug('New tweet posted. Id %s', id);

            cb(null, id);
        });
};

// **Delete tweet**
//
// Pass `id` to delete tweet with `tweet_id` == `id`
//
api.deleteTweet = function(id, cb) {
    this.goToStatus(id)
        .click('[data-item-id="' + id + '"] .ProfileTweet-action--more .ProfileTweet-actionButton')
        .click('[data-item-id="' + id + '"] li.js-actionDelete button')
        .click('#delete-tweet-dialog .delete-action')
        .call(cb);
};

// **Go to status**
//
// Opens specific tweet page
api.goToStatus = function(id, cb) {
    var client = this._client;

    this.url('https://twitter.com/' + client.options.username + '/status/' + id)
        .call(cb);
};

// **Go to notification settings**
//
// Opens /settings/notifications page
//
api.goToNotificationsSettings = function(cb) {
    this.login()
        .url('https://twitter.com/settings/notifications')
        .call(cb);
};

// **Turn off email notifications**
//
// Allows you to turn off all email communication from twitter for this account
//
api.turnOffEmailNotifications = function(cb) {
    this.goToNotificationsSettings()
        .isExisting('#notifications-global-off', function(err, res) {
            if (err) { cb(err); }

            if (! res) {
                debug('Notifications already turned off');
                return cb(null);
            }

            return this.click('#notifications-global-off');
        })
        .call(cb);
};

// **Turn on email notifications**
//
// Allows you to turn on enabled email communication for this twitter account.
//
api.turnOnEmailNotifications = function(cb) {
    this.goToNotificationsSettings()
        .isExisting('#notifications-global-on', function(err, res) {
            if (err) { cb(err); }

            if (! res) {
                debug('Notifications already turned on');
                return cb(null);
            }

            return this.click('#notifications-global-on');
        })
        .call(cb);
};

// **Change notification settings**
//
// Allows to turn on/off individual emails
//
// Following types are available:
//
// * send_favorited_email
// * send_favorited_mention_email
// * send_retweeted_email
// * send_retweeted_mention_email
// * send_mention_email
// * send_new_friend_email
// * send_new_direct_text_email
// * send_shared_tweet_e
// * mailsend_address_book_notification_email
// * send_favorited_retweet_email
// * send_retweeted_retweet_email
// * network_digest_schedule
// * send_network_activity_email
// * performance_digest_schedulesend_magic_recs_e
// * mail' +
// * send_email_newsletter
// * send_activation_email
// * send_resurrection_email_1
// * send_partner_email
// * send_survey_emailsend_follow_recs_email
// * send_similar_people_email
//
// Example:
//
//      client.api.changeNotificationsSettings({
//        send_favorited_email: true, // Turn on 'Favorited' emails
//        sent_retweeted_email: false // Turn off 'Retweeted' emails
//      });
//
api.changeNotificationsSettings = function(settings, cb) {
    var api = this;

    this.goToNotificationsSettings();

    if (! _.isObject(settings)) {
        return cb(new Error('`settings` should be object with following possibble options: ' +
                            'send_favorited_email,send_favorited_mention_email,send_retweeted_email,' +
                            'send_retweeted_mention_email,send_mention_email,send_new_friend_email,' +
                            'send_new_direct_text_email,send_shared_tweet_email,send_address_book_notification_email,' +
                            'send_favorited_retweet_email,send_retweeted_retweet_email,network_digest_schedule,' +
                            'send_network_activity_email,performance_digest_schedule,send_magic_recs_email,' +
                            'send_email_newsletter,send_activation_email,send_resurrection_email_1,' +
                            'send_partner_email,send_survey_email,send_follow_recs_email,send_similar_people_email'));
    }

    var res = _.forOwn(settings, function(v, k) {
        api.getAttribute('#' + k, 'checked', function(err, value) {
            if (err) { cb(err); return false; }

            if ((value && !v) || (!value && v)) {
                return this.click('#' + k);
            }
        });
    });

    if (! res) {
        return false;
    }

    api.click('#settings_save')
       .call(cb);
};

// **Follow/Unfollow**
//
// Specify action `follow` or `unfollow` to follow/unfollow user specified by user_id.
// `user_id` can be both screen_name or twitter user_id.
//
api.followAction = function(action, user_id, cb) {
    var url;

    if (_.isNumber(user_id) || (_.isString(user_id) && user_id.match(/^\d+$/))) {
        url = 'https://twitter.com/intent/user?user_id=' + user_id;
    }
    else {
        url = 'https://twitter.com/intent/user?screen_name=' + user_id;
    }

    this.url(url)
        .isVisible('form.' + action, function(err, visible) {
            if (err) {
                return cb(err);
            }

            if (visible) {
                return this.click('form.' + action + ' button');
            }
        })
        .call(cb);
};

// **Follow**
//
// Follows user specified by user_id. `user_id` can be either numeric user_id, or screen_name
//
api.follow = function(user_id, cb) {
    this.followAction('follow', user_id)
        .call(cb);
};

// **Unfollow**
//
// Unfollows user specified by user_id. `user_id` can be either numeric user_id, or screen_name
//
api.unfollow = function(user_id, cb) {
    this.followAction('unfollow', user_id)
        .call(cb);
};

Client.prototype.api = api;

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

module.exports = Client;
