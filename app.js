var express = require('express'),
	session = require('express-session'),
	path = require('path'),
	logger = require('morgan'),
	bodyParser = require('body-parser'),
	app = express(),
	JiraApi = require('jira').JiraApi,
	jiraBaseUrl = 'jira.returnonintelligence.com';

app.use(session({
		secret: 'superSecret',
		resave: false,
		saveUninitialized: false
	}));

app
	.use(logger('dev'))
	.use(bodyParser.json())
	.use(express.static(path.join(__dirname, 'public')));

app.use(function (req, res, next) {
	var c = req.session.credentials,
		allowed = (req.url.indexOf('/login') == 0 || req.url.indexOf('/logout') == 0 || (c && c.isAuthorized));
	(allowed ? next() : res.status(401).end('Unauthorized!'));
});

app.get('/isAuthorized', function (req, res) {
	res.json({
		isAuthorized: true,
		name: req.session.credentials.displayName
	});
});

app.post('/login', function (req, res) {
	var c = req.session.credentials = {
		username: req.body.username || '',
		password: req.body.password || '',
		protocol: 'https',
		port: 443,
		hostname: jiraBaseUrl,
		apiVersion: 2,
		isAuthorized: false
	},
	jira = new JiraApi(c.protocol, c.hostname, c.port, c.username, c.password, c.apiVersion);
	jira.getCurrentUser(function (error, user) {
		if (error) {
			console.log(error);
			res.status(401).end(error);
			return true;
		}
		c.isAuthorized = true;
		c.displayName = user.name;
		res.end('ok');
	});
});

app.post('/logout', function (req, res) {
	req.session.destroy();
	res.end('ok');
});

app.use(function (req, res, next) {
	var c = req.session.credentials;
	req.jira = new JiraApi(c.protocol, c.hostname, c.port, c.username, c.password, c.apiVersion);
	next();
});

app.get('/rest/api/latest/search', function (req, res) {
	var jql = req.query.jql;
	req.jira.searchJira(jql, { maxResults: 1000, fields: ['summary', 'description', 'customfield_13342'] }, function(error, result) {
		if (error) {
			res.status(400).end(error);
			return true;
		}
		res.json(result);
	});
});

app.get('/rest/api/latest/issue/:id', function (req, res) {
	req.jira.findIssue(req.params.id, function(error, issue) {
		if (error) {
			res.status(400).end(error);
			return true;
		}
		res.json(issue);
	});
});

app.post('/rest/api/latest/subtask', function (req, res) {
	var s = req.body.issue;
	if (!s) {
		res.status(400).end('missing parameter');
		return true;
	}
	req.jira.addNewIssue(s, function(error, issue) {
		if (error) {
			res.status(400).json(error);
			return true;
		}
		jira.updateIssue(issue.id, {
			fields: {
				priority: s.fields.priority
			}
		});
		res.json(issue);
	});
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});

// error handler
// will print stacktrace
app.use(function(err, req, res, next) {
	res.status(err.status || 500).json(err);
});

module.exports = app;