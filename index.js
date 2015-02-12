var debug = require('debug')('twiser');
var webdriverio = require('webdriverio');
var browserevent = require('browserevent');
var _ = require('lodash');

var Api = function(options) {
    this.options = _.extend({
        username: false,
        password: false
    }, options);

    var remoteOptions = _.extend({
        desiredCapabilities: {
            browser: 'chrome'
        }
    }, this.options.remoteOptions);

    this.client = webdriverio.remote(remoteOptions).init();
    browserevent.init(this.client);
};

Api.prototype.login = function() {
    var api = this;

    if (!this.options.username || !this.options.password) {
        throw new Error('Login requested, but no username/password provided');
    }

    return api.client
        .url(function(err, res) {
            if (err) {
                throw new Error(err);
            }

            if (! res.value.match(/^https\:\/\/twitter\.com\/login/i) ) {
                return api.client.url('https://twitter.com/login');
            }
        })
        .title(function(err, res) {
            if (err) {
                throw new Error(err);
            }

            var title = res.value;

            if (title.match(/login/i)) {
                debug('Logging in with username: %s and password: %s', api.options.username, api.options.password);

                return api.client
                  .setValue('#page-container .js-username-field', api.options.username)
                  .setValue('#page-container .js-password-field', api.options.password)
                  .click('#page-container button.submit')
                ;
            }
            else {
                debug('Already logged in');
            }
        })
        .url(function(err, res) {
            if (err) {
                throw new Error(err);
            }

            var url = res.value;

            if (url.match(/login\/error/i)) {
                return api.client.getText('.message-text', function(err, text) {
                    if (err) {
                        throw new Error(err);
                    }

                    throw new Error('Unable to login. Reason: ' + text);
                });
            }
        })
    ;
};

Api.prototype.logout = function() {
    return this.client
        .url('https://twitter.com/logout')
        .click('.signout-wrapper button.primary-btn')
    ;
};

Api.prototype.setNewPassword = function(newPassword) {
    var api = this;

    return this.client
        .url('https://twitter.com/settings/password')
        .title(function(err, res) {
            if (err) {
                throw new Error(err);
            }

            if (res.value.match(/login/i)) {
                return api.login();
            }

            if (! res.value.match(/settings/i)) {
                throw new Error('Not sure where I ended up :(');
            }
        })
        .setValue('#current_password', api.options.password)
        .setValue('#user_password', newPassword)
        .setValue('#user_password_confirmation', newPassword)
        .click('#settings_save')
        .url(function(err, res) {
            if (err) {
                throw new Error(err);
            }

            if (res.value !== 'https://twitter.com/settings/passwords/password_reset_confirmation') {
                debug('Password did not change successfuly');

                return this
                    .getText('#settings-alert-box h4', function(err, text) {
                        debug('got text');

                        if (err) {
                            throw new Error(err);
                        }

                        throw new Error('Unable to change password: ' + text);
                    })
                ;
            }

            api.options.password = newPassword;
        })
    ;
};

Api.prototype.shutdown = function() {
    this.client.end();
};

module.exports = Api;
