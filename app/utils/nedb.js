const DataStore = require('nedb-promise');
const path = require('path');
const DB_PATH = __dirname + '/../../etc/data.db';

const dbs = new DataStore({
    autoload: true,
    filename: path.join(DB_PATH)
});
module.exports = dbs;
