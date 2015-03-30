var express = require('express'),
	session = require('express-session'),
	path = require('path'),
	logger = require('morgan'),
	compress = require('compression'),
	bodyParser = require('body-parser'),
	https = require('https'),
	request = require('request'),
	app = express(),
	JiraApi = require('jira').JiraApi,
	jiraBaseUrl = 'jira.returnonintelligence.com',
	mongoose = require('mongoose');

mongoose.connect('mongodb://localhost/test', { keepAlive: 1 });
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));

var checklistSchema = mongoose.Schema({
	issueKey: String,
	pageId: Number,
	pageVersion: Number,
	createdAt: {type: Date, default: Date.now},
	updatedAt: {type: Date, default: Date.now},
	tests: {type: mongoose.Schema.Types.Mixed, default: {}}
});
checklistSchema.pre('save', function (next) {
	this.updatedAt = new Date();
	this.markModified('tests');
	next();
});

var Checklist = mongoose.model('Checklist', checklistSchema);

var MongoStore = require('connect-mongo')(session);
app.use(session({
	secret: 'superSecret',
	resave: false,
	saveUninitialized: false,
	store: new MongoStore({
		url: 'mongodb://localhost/test'
	})
}));

app
	.use(logger('dev'))
	.use(compress())
	.use(bodyParser.json({ limit: '10mb' }))
	.use(bodyParser.urlencoded({ limit: '10mb', extended: false }))
	.use(express.static(path.join(__dirname, 'public')));

app.use(function (req, res, next) {
	res.set({
		"Access-Control-Allow-Origin": req.headers.origin,
		"Access-Control-Allow-Credentials": "true",
		'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
		'Access-Control-Allow-Headers': 'Origin, Accept, Content-Type, Authorization, Content-Length, X-Requested-With'
	});
	('OPTIONS' === req.method ? res.status(200).end() : next());
});

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

app.post('/generatereport', function (req, res) {
	var c = req.session.credentials,
		pageId = req.body.pageId,
		pageVersion = req.body.pageVersion,
		issueKey = req.body.issueKey,
		comment = req.body.comment,
		img = req.body.img;
	if (!pageId || !pageVersion || !issueKey || !comment) {
		res.status(400).end('missing parameters');
		return;
	}
	req.jira.addComment(issueKey, comment, function(error) {
		if (error) {
			res.status(400).json(error);
			return true;
		}
		attachScreenshot (pageId, pageVersion, issueKey, c, img, function (err) {
			if (err) {
				console.log('attachScreenshot', err);
			}
		});
		res.json({issueKey: issueKey, comment: comment});
	});
});

app.post('/changetestatus', function (req, res) {
	var newStatusId,
		issueKey = req.body.issueKey,
		status = req.body.status,
		statusIds = {
			'Passed': '51',
			'Failed': '201'
		};

	if (!issueKey || !status) {
		return res.status(400).end('missing parameters');
	}
	if (!(newStatusId = statusIds[status])) {
		return res.status(400).end('incorrect status');
	}
	var newSettings = {
		transition: {
			id: newStatusId
		}
	};
	req.jira.transitionIssue(issueKey, newSettings, function(error) {
		if (error) {
			res.status(400).json(error);
			return true;
		}
		res.json({issueKey: issueKey});
	});
});

app.get('/gettests', function (req, res) {
	var pageId = req.query.pageId,
		pageVersion = req.query.pageVersion,
		issueKey = req.query.issueKey;
	if (!pageId || !pageVersion || !issueKey) {
		res.status(400).end('missing parameters');
		return;
	}
	Checklist.findOne({pageId: pageId, pageVersion: pageVersion, issueKey: issueKey}, function (err, doc) {
		if (err) {
			res.status(500).end(err);
			return;
		}
		res.json({tests: (doc ? doc.tests : {})});
	});
});

app.post('/savetest', function (req, res) {
	var pageId = req.body.pageId,
	pageVersion = req.body.pageVersion,
	issueKey = req.body.issueKey,
	testId = req.body.testId,
	testStatus = req.body.testStatus || '';
	if (!pageId || !pageVersion || !issueKey || !testId) {
		res.status(400).end('missing parameters');
		return;
	}
	Checklist.findOne({pageId: pageId, pageVersion: pageVersion, issueKey: issueKey}, function (err, checklist) {
		if (err) {
			res.status(500).end(err);
			return;
		}
		checklist = checklist || new Checklist({pageId: pageId, pageVersion: pageVersion, issueKey: issueKey});
		checklist.tests[testId] = testStatus;
		checklist.save(function (err, doc) {
			if (err) {
				res.status(500).end(err);
				return;
			}
			res.json({ testId: doc.testId, testStatus: doc.testStatus });
		});
	});
});

function attachScreenshot (pageId, pageVersion, issueKey, credentials, img, cb) {
	var c = credentials;
	var b = new Buffer(img, 'base64');
	var formData = {
		file: {
			value: b,
			options: {
				filename: issueKey + '_' + pageId + '_' + pageVersion + '.png',
				contentType: 'image/png'
			}
		}
	};
	request.post({
		url: 'https://' + jiraBaseUrl + '/rest/api/2/issue/' + issueKey + '/attachments',
		formData: formData,
		headers: {
			'X-Atlassian-Token': 'nocheck',
			'Authorization': 'Basic ' + new Buffer(c.username + ':' + c.password).toString('base64')
		}
	}, cb);
}

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
