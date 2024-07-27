require("dotenv").config()

const express = require('express');
const session = require('express-session')
const passport = require('passport')
const app = express();
const flash = require('express-flash')

// mongo
const Mongo = require('connect-mongo')
const mongoose = require('mongoose')
mongoose.connect(process.env.URI)
const db = mongoose.connection

const User = require('./user')
const Log = require('./logging')
const rcon = require('./rcon_request')

app.set("view engine", "ejs");
app.use(flash())
app.use(express.urlencoded({extended: true}))
app.use(express.static(__dirname + '/node_modules/bootstrap/dist'));
app.use(session({
    secret: process.env.EXPRESS_SECRET,
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

// todo make authenticate!
app.post('/register', function (req, res) {
    console.log(req.body)
    User.register(
        new User( {username: req.body.username, type: req.body.type} ),
        req.body.password,
        function (err, msg) {
            if (err) {
                res.send(err)
            } else {
                res.send({ message: "Successful" })
            }
        }
    )
})


app.post('/login', passport.authenticate('local', { 
    failureRedirect: '/login-failure', 
    successRedirect: '/'
  }), (err, req, res, next) => {
    if (err) next(err);
});

app.post('/logout', (req, res, next) => {
    req.logout(function(err) {
        if (err) { return next(err); }
    });
    res.redirect('/login');
});

app.get('/login-failure', (req, res, next) => {
    console.log(req.session);

    req.flash('login_status', "Incorrect Login Credentials")
    res.redirect('/login');
});

app.post('/send-command', async (req, res, next) => {
    if (req.isAuthenticated()) {
        var cmd = rcon.GetCommand(req.body.command)
        var auth = rcon.AuthLevel(req.user.type)

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

app.listen(process.env.APP_PORT, () => {
    console.log("Server started on port " + process.env.APP_PORT);
});