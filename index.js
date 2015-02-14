/* eslint no-underscore-dangle: 0, handle-callback-err: 0 */
var debug = require('debug')('twiser');
var webdriverio = require('webdriverio');
var browserevent = require('browserevent');
var _ = require('lodash');

var Client = function(options) {
    this.options = _.extend({
        username: false,
        password: false
    }, options);

    var remoteOptions = _.extend({
        desiredCapabilities: {
            browser: 'chrome'
        }
    }, this.options.remoteOptions);

    var addonCommands = this.api;
    var api = this.api = webdriverio.remote(remoteOptions).init();
    this.api._client = this;

    browserevent.init(this.api);

    _.forOwn(addonCommands, function(handler, command) {
        api.addCommand(command, handler);
    });
};

Client.prototype.api = {};

Client.prototype.api.login = function(cb) {
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

Client.prototype.api.logout = function(cb) {
    this.url('https://twitter.com/logout')
        .click('.signout-wrapper button.primary-btn')
        .call(cb);
};

Client.prototype.api.setNewPassword = function(newPassword, cb) {
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

Client.prototype.api.shutdown = function(cb) {
    this.end();
    cb(null);
};

Client.prototype.api.goToProfile = function(profile, cb) {
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

Client.prototype.api.editProfile = function(cb) {
    this.login()
        .goToProfile()
        .click('[data-scribe-element="profile_edit_button"]')
        .call(cb);
};

Client.prototype.api.saveProfile = function(cb) {
    this.click('.ProfilePage-saveButton')
        .getActionMessage(function(err, text) {
            if (err) { return cb(err); }

            if (text && text.indexOf('Your profile has been saved.') === -1) {
                return cb(new Error('Unable to save profile info: ' + text));
            }
        })
        .call(cb);
};

Client.prototype.api.getActionMessage = function(cb) {
    this.getText('.message-text', function(err, text) {
        if (err) { return cb(err); }

        if (text) {
            debug('Got message: %s', text);
            return cb(null, text);
        }

        cb(null);
    });
};

Client.prototype.api.getProfileInfo = function(cb) {
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

Client.prototype.api.setProfileInfo = function(profile, cb) {
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

Client.prototype.api.postUpdate = function(update, cb) {
    if (_.isString(update)) {
        update = {
            post: update
        };
    }

    this.login();

    var selectorPrefix = '.timeline-tweet-box form';

    if (update.inreply) {
        selectorPrefix = '.inline-reply-tweetbox';
    }

    if (update.inreply) {
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
            if (text) {
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

Client.prototype.api.deleteTweet = function(id, cb) {
    this.goToStatus(id)
        .click('[data-item-id="' + id + '"] .ProfileTweet-action--more .ProfileTweet-actionButton')
        .click('[data-item-id="' + id + '"] li.js-actionDelete button')
        .click('#delete-tweet-dialog .delete-action')
        .call(cb);
};

Client.prototype.api.goToStatus = function(id, cb) {
    var client = this._client;

    this.url('https://twitter.com/' + client.options.username + '/status/' + id)
        .call(cb);
};

Client.prototype.api.goToNotificationsSettings = function(cb) {
    this.login()
        .url('https://twitter.com/settings/notifications')
        .call(cb);
};

Client.prototype.api.turnOffEmailNotifications = function(cb) {
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

Client.prototype.api.turnOnEmailNotifications = function(cb) {
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

Client.prototype.api.changeNotificationsSettings = function(settings, cb) {
    var api = this;

    api.goToNotificationsSettings();

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

module.exports = Client;
