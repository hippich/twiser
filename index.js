/* eslint no-underscore-dangle: 0 */
var debug = require('debug')('twiser');
var webdriverio = require('webdriverio');
var browserevent = require('browserevent');
var _ = require('lodash');

var Client = function(options) {
    var client = this;

    this.options = _.extend({
        username: false,
        password: false
    }, options);

    var remoteOptions = _.extend({
        desiredCapabilities: {
            browser: 'chrome'
        }
    }, this.options.remoteOptions);

    this.api = webdriverio.remote(remoteOptions).init();
    this.api._client = this;

    browserevent.init(this.api);

    this.api.addCommand('login', function(cb) {
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
    });

    this.api.addCommand('logout', function(cb) {
        this.url('https://twitter.com/logout')
            .click('.signout-wrapper button.primary-btn')
            .call(cb);
    });

    this.api.addCommand('setNewPassword', function(newPassword, cb) {
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
    });

    this.api.addCommand('shutdown', function(cb) {
        this.end();
        cb(null);
    });

    this.api.addCommand('goToProfile', function(profile, cb) {
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
    });

    this.api.addCommand('editProfile', function(cb) {
        this.login()
            .goToProfile()
            .click('[data-scribe-element="profile_edit_button"]')
            .call(cb);
    });

    this.api.addCommand('saveProfile', function(cb) {
        this.click('.ProfilePage-saveButton')
            .call(cb);
    });

    this.api.addCommand('getProfileInfo', function(cb) {
        var profile = {
            name     : '',
            bio      : '',
            location : '',
            url      : ''
        };

        this.goToProfile()
            .getText('.ProfileHeaderCard-nameLink', function(err, text) {
                if (err) { return cb(err); }
                profile.name = text;
            })
            .getText('.ProfileHeaderCard-bio', function(err, text) {
                if (err) { return cb(err); }
                profile.bio = text;
            })
            .getText('.ProfileHeaderCard-locationText', function(err, text) {
                if (err) { return cb(err); }
                profile.location = text;
            })
            .getText('.ProfileHeaderCard-urlText a', function(err, text) {
                if (err) { return cb(err); }
                profile.url = text;
            })
            .call(function() {
                cb(null, profile);
            });
    });

    this.api.addCommand('setProfileInfo', function(profile, cb) {
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
    });

};

module.exports = Client;
