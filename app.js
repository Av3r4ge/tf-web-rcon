const express = require('express')
const session = require('express-session')
const passport = require('passport')
const crypto = require("crypto")
const flash = require('express-flash')
const app = express()

// mongo
const Mongo = require('connect-mongo')
const mongoose = require('mongoose')
mongoose.connect("mongodb://mongo:27017/docker-node-mongo")
const db = mongoose.connection

const User = require('./user')
const Log = require('./logging')
const rcon = require('./rcon_request')
const perms = require('./permissions')

function GenKey(length) {
    let generatedKey = "";
    const validChars = "0123456789" +
        "abcdefghijklmnopqrstuvwxyz" +
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
        ",.-{}+!\"#$%/()=?";
    for (let i = 0; i < length; i++) {
        let randomNumber = crypto.getRandomValues(new Uint32Array(1))[0]
        randomNumber = randomNumber / 0x100000000;
        randomNumber = Math.floor(randomNumber * validChars.length)

        generatedKey += validChars[randomNumber]
    }
    return generatedKey
}

app.set("view engine", "ejs")
app.use(flash())
app.use(express.urlencoded({extended: true}))
app.use(express.static(__dirname + '/node_modules/bootstrap/dist'))
app.use(session({
    secret: GenKey(128),
    resave: false,
    saveUninitialized: true,
    store: new Mongo({ mongoUrl: db.client.s.url })
}));

// local passport strategy
const LocalStrategy = require('passport-local')
const strategy = new LocalStrategy(User.authenticate()) 
passport.use(strategy)
passport.serializeUser(User.serializeUser())
passport.deserializeUser(User.deserializeUser())
app.use(passport.initialize())
app.use(passport.session());

function isAuthed(req, res, next) {
    if (req.isAuthenticated()) { 
        if (req.user.isDisabled) {
            res.redirect('/disabled')
            return
        }

        return next()
    } else {
        res.redirect('/login')
    }
}

function isNotAuthed(req, res, next) {
    if (req.isAuthenticated()) {
        res.redirect('/')
    } else {
        next()
    }
}

// TODO test if theres any other ways people can abuse arg inputs
function cleanseResponse(input) {
    return input.split(';')[0];
}

app.get('/', isAuthed, (req, res) => {
    res.render('index', { name: req.user.username, type: req.user.type, conresponse: req.flash('console_response') })
})

app.get('/login', isNotAuthed, (req, res) => {
    res.render('login', {status: req.flash('login_status')})
})

// todo: change the way we're loading users. Ideally don't load all of them!
app.get('/users', isAuthed, async (req, res) => {

    const authLevel = perms.AuthLevel(req.user.type)

    if ( authLevel < 3 ) {
        res.redirect('/')
        return
    }

    await User.find().then(users => {
        res.render('users', {name: req.user.username, type: req.user.type, users: users})
    }).catch(err => {
        console.log(err)
        res.render('users', {name: req.user.username, type: req.user.type, users: []})
    })
})

app.get('/logs', isAuthed, (req, res) => {
    res.render('logs')
})

app.get('/disabled', (req, res) => {

    if ( req.isAuthenticated() ) {
        res.render('disabled')
    } 

})

app.post('/account/register', function (req, res) {
    if (req.isAuthenticated()) {
        // at some point check what user type is being submitted and validate it
        // this is fine for now though
        const authLevel = perms.AuthLevel(req.user.type)

        if (req.user.isDisabled) { 
            res.json({ message: 'Your account is disabled.' })
            return
        }

        if ( authLevel >= 3 ) {
            User.register(
                new User( {username: req.body.username, type: req.body.type} ),
                req.body.password,
                function (err, msg) {
                    if (err) {
                        res.send(err)
                    } else {
                        res.redirect('/')
                    }
                }
            )
        } else {
            res.json({ message: 'You do not have permission to do this!' })
        }

    } else {
        res.json({ message: 'You are not authenticated' })
    }
})

async function disableAccount(username) {
    const foundUser = await User.find({ username: username })

    if ( foundUser[0] && foundUser[0].type != "root" ) {
        foundUser[0].isDisabled = true
        foundUser[0].save()
        return true
    }

    return false
}

async function enableAccount(username) {
    const foundUser = await User.find({ username: username })

    if ( foundUser[0] && foundUser[0].type != "root" ) {
        foundUser[0].isDisabled = false
        foundUser[0].save()
        return true
    }

    return false
}

app.post('/account/enable-account', function (req, res) {
    if (req.isAuthenticated()) {
        const authLevel = perms.AuthLevel(req.user.type)

        if (req.user.isDisabled) { 
            res.json({ message: 'Your account is disabled.' })
            return
        }

        if ( !authLevel >= 3 ) {
            res.redirect('/users')
            return
        }

        try {
            let success = enableAccount( req.body.objectid )
            res.redirect('/users')
        } catch (err) {
            console.log(err)
            res.redirect('/users')
        }

    } else {
        res.json({ message: 'You are not authenticated' })
    }    
})

app.post('/account/delete-account', function (req, res) {
    if (req.isAuthenticated()) {
        const authLevel = perms.AuthLevel(req.user.type)

        if (req.user.isDisabled) { 
            res.json({ message: 'Your account is disabled.' })
            return
        }

        if ( !authLevel >= 3 ) {
            res.redirect('/users')
            return
        }

        try {
            let success = disableAccount( req.body.objectid )
            res.redirect('/users')
        } catch (err) {
            console.log(err)
            res.redirect('/users')
        }

    } else {
        res.json({ message: 'You are not authenticated' })
    }    
})

app.post('/login', passport.authenticate('local', { 
    failureRedirect: '/login-failure', 
    successRedirect: '/'
  }), (err, req, res, next) => {
    if (err) next(err)
});

app.post('/logout', (req, res, next) => {
    req.logout(function(err) {
        if (err) { return next(err); }
    });
    res.redirect('/login')
});

app.get('/login-failure', (req, res, next) => {
    console.log(req.session);

    req.flash('login_status', "Incorrect Login Credentials")
    res.redirect('/login')
});

app.post('/send-command', async (req, res, next) => {
    if (req.isAuthenticated()) {
        if (req.user.isDisabled) { 
            res.json({ message: 'Your account is disabled.' })
            return
        }

        if ( !rcon.isAuthed ) {
            req.flash('console_response', "[ERROR] RCON is not authed, please check if configuration is correct")
            res.redirect('/')
            return
        }

        var cmd = rcon.GetCommand(req.body.command)
        var auth = perms.AuthLevel(req.user.type)

        if ( auth < cmd.level ) {
            res.json({ message: 'You are not authorized to run this command' })
            return
        } 

        if (cmd) {
            if ( (req.body.args == undefined) || (cmd.args == false) ) {
                rcon.RunCommand(cmd.cmd)

                new Log({
                    timestamp: Date.now(),
                    executor: req.user.username,
                    command: cmd.cmd
                }).save()
            } else {
                rcon.RunCommand(cmd.cmd + " " + cleanseResponse(req.body.args) )
                new Log({
                    timestamp: Date.now(),
                    executor: req.user.username,
                    command: cmd.cmd + " " + req.body.args
                }).save()
            }
        } else {
            res.json({ message: 'Command not found' })
            req.flash('console_response', "[ERROR] Command isn't found")
            res.redirect('/')
            return
        }

        try {
            const response = await rcon.AwaitConsoleReponse()
            req.flash('console_response', response)
            res.redirect('/')

        } catch(err) {
            req.flash('console_response', "Error sending response, Timeout!")
            res.redirect('/')
        }
    } else {
        res.json({ message: 'You are not authenticated' })
    }
})

async function GenerateRootAccount() {
    const userExist = await User.find({ username: "root" })

    if ( userExist.length > 0 ) {
        return
    }

    let generatedPassword = GenKey(32)

    console.log("ROOT ACCOUNT PASSWORD:")
    console.log("user: root")
    console.log("pass: " + generatedPassword)
    console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^")
    console.log("SAVE THIS")
    
    User.register(
        new User( {username: "root", type: "root"} ),
        generatedPassword
    )
}

GenerateRootAccount()
app.listen(3000, () => {
    console.log("Server started on port " + 3000);
});