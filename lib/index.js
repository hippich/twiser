/* eslint no-underscore-dangle: 0, handle-callback-err: 0, camelcase: 0 */
var debug = require('debug')('twiser');
var webdriverio = require('webdriverio');
var _ = require('lodash');
var cheerio = require('cheerio');

//
// **Client class**
//
// Sample usage:
//
//        var Client = require('twiser');
//
//        var client = new Client({
//          username: 'joe',
//          password: 'passx123',
//          remoteOptions: { // webdriverio remote options - http://webdriver.io/guide.html
//            host: '192.168.155.101',
//            desiredCapabilities: {
//                browser: 'firefox'
//            }
//          }
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
    this.options = _.merge({
        username: false,
        password: false
    }, options);

    var remoteOptions = _.merge({
        desiredCapabilities: {
            browserName: 'chrome',
            chromeOptions: {
                args: ['disable-popup-blocking', 'disable-translate', 'start-maximized'],
                prefs: {
                    profile: {
                        default_content_settings: {
                            images: 2,
                            popups: 5
                        }
                    }
                }
            }
        }
    }, this.options.remoteOptions);

    var addonCommands = this.api;

    this.api = webdriverio.remote(remoteOptions).init(function() {
        if (this.options.readyCb) {
            this.options.readyCb(this.api);
        }

        // Get main window id
        this.api.windowHandle(function(err, res) {
            if (err) {
                throw err;
            }

            this.mainWindowId = res.value;
        });

        this.pingInterval = setInterval(function() {
            this.api.url(function(/*err, value*/) {
                // do nothing here
            });
        }.bind(this), 10000);
    }.bind(this));

    var api = this.api;

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
    debug('Logging out');

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

// **Get Tweets**
//
// Fetches all tweets from current page
api.getTweets = function(cb) {
    // Remove any stylesheets
    this.execute('var stylesheets = document.getElementsByTagName("link"), i, sheet; for(i in stylesheets) { sheet = stylesheets[i]; if (sheet.parentNode) sheet.parentNode.removeChild(sheet); }');

    this.isExisting('.new-tweets-bar', function(err, res) {
            if (err) {
                return;
            }

            if (!err && res) {
                this.click('.new-tweets-bar', function(err) {
                    if (err) {
                        return;
                    }
                });

                return;
            }
        });

    this.getHTML('.stream .stream-items .stream-item .tweet', function(err, res) {
        if (err) {
            return cb(err);
        }

        if (! _.isArray(res)) {
            res = [res];
        }

        return cb(null, res);
    });
};

// **Get direct messages**
//
// Fetches all
api.getDMs = function(cb, includeRead) {
    var api = this;

    // Remove any stylesheets
    this.execute('var stylesheets = document.getElementsByTagName("link"), i, sheet; for(i in stylesheets) { sheet = stylesheets[i]; if (sheet.parentNode) sheet.parentNode.removeChild(sheet); }');

    var selector = '.is-unread';

    if (includeRead) {
        selector = '.DMInboxItem';
    }

    this.getHTML('#dm_dialog ul.DMInbox ' + selector, function(err, res) {
        if (err) {
            return this.refresh();
        }

        if (! _.isArray(res)) {
            res = [res];
        }

        var DMs = [];

        res.forEach(function(thread) {
            var $ = cheerio.load(thread);
            var $thread = $('.DMInboxItem');
            var threadId = $thread.attr('data-thread-id');

            api.click('.DMInboxItem[data-thread-id="' + threadId + '"] .DMInboxItem-title');

            api.getHTML('#dm_dialog_conversation .DirectMessage', function(err, res) {
                if (err) {
                    return;
                }

                if (! _.isArray(res)) {
                    res = [res];
                }

                DMs = DMs.merge(res);
            });
        });

        this.refresh();

        return cb(null, DMs);
    });
};

// **Utility methods**
//
api.newWindowWithId = function(url, id, options, cb) {
    this.newWindow(url, id, options, function(err) {
        if (err) {
            return cb(err);
        }

        this.windowHandle(function(err, res) {
            if (err) {
                return cb(err);
            }

            return cb(err, res);
        });
    });
};

Client.prototype.api = api;
Client.prototype = _.merge( Client.prototype, require('./streaming') ); // Mixin streaming methods

module.exports = Client;
