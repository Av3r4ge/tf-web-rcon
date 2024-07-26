const { promisify } = require('util');
const rcon = require('rcon')
const client = new rcon(process.env.RCON_ADDRESS, process.env.RCON_PORT, process.env.RCON_PASSWORD, {tcp: true})

var self = {
    isAuthed: false,
}

var commandQueue = []

self.AuthLevel = function(userlevel) {
    switch(userlevel) {
        case "root": 
            return 3;
        case "admin":
            return 2
        case "user":
            return 1
        default:
            return -1
    }
}

self.GetCommand = function(ctype) {

    switch(ctype) {

        case "kick":
            return {level: 1, cmd: "sm_kick", args: true}
        case "map":
            return {level: 1, cmd: "sm_map", args: true}
        case "exec":
            return {level: 1, cmd: "exec", args: true}
        case "restart":
            return {level: 2, cmd: "_restart", args: false}
        case "cheats":
            return {level: 2, cmd: "sv_cheats", args: true}
        case "custom":
            return {level: 2, cmd: "", args: true}
        default:
            return false
    
    }

}

self.AwaitConsoleReponse = async function() {
    return new Promise((resolve) => {
        client.once('response', (response) => {
            resolve(response)
        })
    })
}

// because we have to wait for the rcon to auth we add it to a queue and run it when we are authenticated
self.RunCommand = function(cmd) {
    commandQueue.push(cmd)
}

client.on('auth', () => {
    console.log('RCON Authenticated' + " [" + process.env.RCON_ADDRESS + ":" + process.env.RCON_PORT + "]")

    self.RunCommand = function(cmd) {
        client.send(cmd)
    }

    // run queue!
    if (commandQueue.length > 0) {
        for (var i = 0; i < commandQueue.length; i++) {
            client.send(commandQueue[i])
        }
    }

    self.isAuthed = true
})

client.on('error', (err) => {
    console.log(err)
})

client.on('response', (response) => {
    console.log(response)
})

client.on('server', (response) => {
    console.log(response)
})

client.connect()
module.exports = self