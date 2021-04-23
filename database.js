const mysql = require('mysql');
const config = require('./config');

const database = mysql.createConnection({
    host: config.host,
    user: config.user,
    port: config.port,
    password: config.password,
    database: config.database,
    ssl: config.ssl,

});

database.connect(
    function (err) {
        if (err) {
            console.log("!!! Cannot connect !!! Error:");
            throw err;
        }
        else {
            console.log("Connection established.");

        }
    });
module.exports = database;