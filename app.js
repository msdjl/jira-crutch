var express = require('express');
var session = require('express-session');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var https = require('https');
var app = express();

var JiraApi = require('jira').JiraApi;

app.set('demo', process.env.DEMO == 'true' ? 'demo' : '');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(session({secret:'meow'}));
app.use(require('stylus').middleware(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function (req, res) {
	if (!req.session.credentials || !req.session.credentials.isAuthorized) {
		req.session.destroy();
		res.clearCookie('isAuthorized');
		res.clearCookie('displayName');
	}
	res.sendFile(__dirname + '/public/index.html');
});

app.get('/isAuthorized', function (req, res) {
	var c = req.session.credentials;
	if (!c || !c.isAuthorized) {
		res.status(401).end('Unauthorized!');
	}
	else {
		res.json({
			isAuthorized: true,
			name: c.displayName
		});
	}
});

app.get('/rest/api/latest/search', function (req, res) {
	var jql = req.query.jql;

	var c = req.session.credentials;
	if (!c || !c.isAuthorized) {
		res.status(401).end('Unauthorized!');
		return true;
	}

	var jira = new JiraApi(c.protocol, c.hostname, c.port, c.username, c.password, c.apiVersion);

	jira.searchJira(jql, { maxResults: 1000, fields: ['summary', 'description', 'customfield_13342'] }, function(error, result) {
		if (error) {
			res.status(400).end(error);
			return true;
		}
		res.json(result);
	});
});

app.post('/login', function (req, res) {
	var username = req.body.username || '';
	var password = req.body.password || '';
	var protocol = req.body.protocol || 'https';
	var hostname = req.body.hostname || app.get('demo') + 'jira.returnonintelligence.com';
	var port = req.body.port || 443;
	var apiVersion = req.body.apiVersion || 2;

	var c = req.session.credentials = {
		username: username,
		password: password,
		protocol: protocol,
		port: port,
		hostname: hostname,
		apiVersion: apiVersion,
		isAuthorized: false
	};

	var jira = new JiraApi(c.protocol, c.hostname, c.port, c.username, c.password, c.apiVersion);

/*	jira.getCurrentUser(function (error, user) {
		if (error) {
			console.log(error);
			res.status(401).end(error);
			return true;
		}
		c.isAuthorized = true;
		c.displayName = (user && user.displayName) ? user.displayName : 'error';
		res.cookie('displayName', c.displayName);
		res.cookie('isAuthorized', true);
		res.end('ok');
	});*/

	jira.searchUsers(c.username, undefined, undefined, undefined, undefined, function(error, users) {
		if (error) {
			console.log(error);
			res.status(401).end('Unauthorized!');
			return true;
		}
		c.isAuthorized = true;
		c.displayName = (users[0] && users[0].displayName) ? users[0].displayName : 'error';
		res.cookie('displayName', c.displayName);
		res.cookie('isAuthorized', true);
		res.end('ok');
	});
});

app.post('/logout', function (req, res) {
	req.session.destroy();
	res.clearCookie('isAuthorized');
	res.clearCookie('displayName');
	res.end('ok');
});

app.get('/rest/api/latest/issue/:id', function (req, res) {

	var c = req.session.credentials;
	if (!c || !c.isAuthorized) {
		res.status(401).end('Unauthorized!');
		return true;
	}

	var jira = new JiraApi(c.protocol, c.hostname, c.port, c.username, c.password, c.apiVersion);

	jira.findIssue(req.params.id, function(error, issue) {
		if (error) {
			res.status(400).end(error);
			return true;
		}
		res.json(issue);
	});
});

app.post('/rest/api/latest/subtask', function (req, res) {

    var c = req.session.credentials;
    if (!c || !c.isAuthorized) {
        res.status(401).end('Unauthorized!');
        return true;
    }

    var s = req.body.issue;
    if (!s) {
        // bad request
    }

    var jira = new JiraApi(c.protocol, c.hostname, c.port, c.username, c.password, c.apiVersion);

    jira.addNewIssue(s, function(error, issue) {
        if (error) {
            res.status(400).json(error);
            return true;
        }
        res.json(issue);
    });
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

module.exports = app;
