const dotenv = require('dotenv'); // load environment variables from a .env file - should only contain env specific vars (dev, prod, etc) so not encouraged to commit
const json = require('format-json');
const _ = require('lodash'); // utility functions for common tasks - Arrays, Collections, Date, Lang, NUmber, String, etc
const sharedConfig = dotenv.config({path: '../../.env'});
const localConfig = dotenv.config();

if (sharedConfig.error) {
    throw sharedConfig.error
}

if (localConfig.error) {
    throw localConfig.error
}

console.log(json.plain(_.extend(sharedConfig.parsed, localConfig.parsed)));
