module.exports = function (sails) {

    /**
     * Module dependencies.
     */

    var util = require('sails-util'),
        RedisStore = require('socket.io-redis'),
        Redis = require('redis'),
        Socket = {
            authorization: require('./authorization')(sails),
            connection: require('./connection')(sails)
        },
        Primus = require('primus'),
        PrimusResponder = require('primus-responder'),
        Rooms = require('primus-rooms'),
        Emitter = require('primus-emitter');


    /**
     * loadSocketIO()
     * @param {Function} cb
     *
     * Prepare the nascent ws:// server (but don't listen for connections yet)
     */

    return function loadSocketIO(cb) {
        sails.log.verbose('Configuring socket (ws://) server...');

        var socketConfig = sails.config.sockets;

        // Primus server (WebSockets+polyfill to support Flash sockets, AJAX long polling, etc.)
        primus = sails.io = sails.ws = Primus(sails.hooks.http.server, {
            transformer: 'engine.io',
            parser: 'JSON'
        });

        // Add request/response for primus
        primus.use('rooms', Rooms);
        primus.use('emitter', Emitter);

        // Process the Config File
        util.each(socketConfig, function (value, propertyName) {

            // Configure logic to be run before allowing sockets to connect
            if (propertyName === 'authorization') {

                // Custom logic
                if (util.isFunction(value)) {
                    primus.authorize(value);
                    return;
                }

                // `authorization: true` means go ahead and use the default behavior
                if (value === true) {
                    primus.authorize(Socket.authorization);
                    return;
                }

                // Otherwise skip the authorization step

                return;
            }

            // If value is explicitly undefined, do nothing
            if (util.isUndefined(value)) return;

            // In the general case, pass the configuration straight down to socket.io
            //io.set(propertyName, value);

        });


        // For later:
        // io.configure('development', function() {});
        // io.configure('production', function() {});


        // Link Socket.io requests to a controller/action
        // When a socket.io client connects, listen for the actions in the routing table
        // Authorization has already passed at this point!
        primus.on('connection', Socket.connection);

        cb && cb();
    };

    /**
     * Filter config to get only socket.io server settings
     */

    function getSocketIOOnlySettings(socketConfig) {
        var props = [

        ]
    }


    /**
     * Creates a new Redis Connection if specified.
     *
     * Can be used to connect to remote server with authentication if
     * `pass` is declared in the socketConfig file.
     */

    function createRedisConnection(port, host, id) {

        var socketConfig = sails.config.sockets;

        // Create a new client using the port, host and other options
        var client = Redis.createClient(port, host, socketConfig);

        // If a password is needed use client.auth to set it
        if (socketConfig.pass) {
            client.auth(socketConfig.pass, function (err) {
                if (err) throw err;
            });
        }

        // If a db is set select it on the client
        if (socketConfig.db) {
            client.select(socketConfig.db);
        }

        // If Redis connection ends, catch the error and retry
        // until it comes back

        client.on('ready', function () {
            sails.log.debug('RedisClient::Events[ready]: [OK] Redis "' + id + '" is up. Connections: ', client.connections);
        });

        client.on('end', function () {
            sails.log.debug('RedisClient::Events[end]: "' + id + '" , Connected:', client.connected);
        });

        client.on('error', function (err) {
            sails.log.error('RedisClient::Events[error]: "' + id + '" , ' + err);
            if (/ECONNREFUSED/g.test(err)) {
                sails.log.error('Waiting for "' + id + '" redis client to come back online. Connections:', client.connections);
            }
        });

        return client;
    }

};
