module.exports = (function() {

  'use strict';

  const anyDB = require('any-db-postgres');
  const beginTransaction = require('any-db-transaction');
  const async = require('async');
  const colors = require('colors/safe');

  const PostgresAdapter = require('./adapters/postgres.js');

  class Database {

    constructor(cfg) {

      this.adapter = new PostgresAdapter();

      this._connection = null;

      this._useLogColor = 0;

    }

    connect(cfg) {

      var connection;

      if (cfg.connectionString) {
        connection = anyDB.createConnection(cfg.connectionString);
      } else {
        connection = anyDB.createConnection(
          this.adapter.generateConnectionString(cfg.host, cfg.port, cfg.database, cfg.user, cfg.password)
        );
      }

      this._connection = connection;

      return true;

    }

    close() {

      this._connection && this._connection.end();
      this._connection = null;

    }

    log(sql, params) {

      var colorFunc = this.__logColorFuncs[this._useLogColor];

      console.log();
      console.log(colorFunc(sql));
      params && console.log(colorFunc(JSON.stringify(params)));
      console.log();

      this._useLogColor = (this._useLogColor + 1) % this.__logColorFuncs.length;

      return true;

    }

    info(message) {

      console.log(colors.green.bold('Database Info: ') + message);

    }

    error(message) {

      console.log(colors.red.bold('Database Error: ') + message);

      return true;

    }

    query(query, params, callback) {

      if (arguments.length < 3) {
        throw new Error('.query requires 3 arguments');
      }

      if (!(params instanceof Array)) {
        throw new Error('params must be a valid array');
      }

      if(typeof callback !== 'function') {
        throw new Error('Callback must be a function');
      }

      this._connection.query(query, params, callback);
      this.log(query, params);

      return true;

    }

    transaction(preparedArray, callback) {

      if (!preparedArray.length) {
        throw new Error('Must give valid array of statements (with or without parameters)');
      }

      if (typeof preparedArray === 'string') {
        preparedArray = preparedArray.split(';').filter(function(v) {
          return !!v;
        }).map(function(v) {
          return [v];
        });
      }

      if(typeof callback !== 'function') {
        callback = function() {};
      }

      var db = this;
      var transaction = beginTransaction(this._connection);

      var queries = preparedArray.map(function(queryData, i) {

        queryData[1] = queryData[1] || [];

        if (i > 0) {

          return function(result, next) {
            db.log(queryData[0], queryData[1]);
            transaction.query(queryData[0], queryData[1], next);
          };

        }

        return function(next) {
          db.log(queryData[0], queryData[1]);
          transaction.query(queryData[0], queryData[1], next);
        };

      });

      var transactionError = null;

      transaction.on('rollback:start', function() {

        db.info('Rollback started...');

      });

      transaction.on('rollback:complete', function() {

        db.info('Rollback complete!');

      });

      transaction.on('commit:start', function() {

        db.info('Commit started...');

      });

      transaction.on('commit:complete', function() {

        db.info('Commit complete!');

      });

      transaction.on('close', function() {

        db.info('Transaction complete!');

        callback(transactionError);

      });

      db.info('Transaction started...');

      async.waterfall(queries, function(err) {

        if (err) {
          transactionError = err;
          db.error(err.message);
          transaction.rollback();
        }

        transaction.commit();

      });

    }

  }

  Database.prototype.__logColorFuncs = [
    function(str) {
      return colors.yellow.bold(str);
    },
    function(str) {
      return colors.white(str);
    }
  ];

  return Database;

})();
