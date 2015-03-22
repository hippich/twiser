/* eslint camelcase: 0 */
var cheerio = require('cheerio');

var DM = function(html) {
    var $ = cheerio.load(html);

    var $tweet = $('.tweet');

    this.id = this.id_str = $tweet.attr('data-tweet-id');
    this.created_at = new Date( Number($('._timestamp').attr('data-time-ms')) );
    this.text = $('.tweet-text').text();
    this.html = $('.tweet-text').html();
    this.retweet_id = $tweet.attr('data-retweet-id');
    this.retweeted = $('.js-retweet-text').length > 0;
    this.is_reply = $tweet.attr('data-is-reply-to') === 'true';

    this.user_mentions = ($tweet.attr('data-mentions') || '').split(' ');

    this.user = {};
    this.user.id = this.user.id_str = $tweet.attr('data-user-id');
    this.user.name = $tweet.attr('data-name');
    this.user.screen_name = $tweet.attr('data-screen-name');
    this.user.lang = $('.tweet-text').attr('lang') || 'en';

    return this;
};

module.exports = DM;
