var express = require('express');
var session = require('express-session');
var path = require('path');
var logger = require('morgan');
var compress = require('compression');
var bodyParser = require('body-parser');
var https = require('https');
var request = require('request');
var app = express();
var JiraApi = require('jira').JiraApi;
var jiraBaseUrl = 'jira.returnonintelligence.com';
var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/test', { keepAlive: 1 });
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));

var testSchema = mongoose.Schema({
	testId: String,
	testStatus: String,
	createdAt: {type: Date, default: Date.now},
	updatedAt: Date,
	context: {type: mongoose.Schema.Types.ObjectId, ref: 'Context'}
});
testSchema.pre('save', function (next) {
	this.updatedAt = new Date();
	next();
});

var contextSchema = mongoose.Schema({
	issueKey: String,
	pageId: Number,
	pageVersion: Number,
	createdAt: {type: Date, default: Date.now},
	tests: [{type: mongoose.Schema.Types.ObjectId, ref: 'Test'}]
});

var Test = mongoose.model('Test', testSchema);
var Context = mongoose.model('Context', contextSchema);

var MongoStore = require('connect-mongo')(session);
app.use(session({
	secret: 'superSecret',
	resave: false,
	saveUninitialized: false,
	store: new MongoStore({
		url: 'mongodb://localhost/test'
	})
}));

app.use(logger('dev'));
app.use(compress());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(function (req, res, next) {
	res.header("Access-Control-Allow-Origin", req.headers.origin);
	res.header("Access-Control-Allow-Credentials", "true");
	res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
	res.header('Access-Control-Allow-Headers', 'Origin, Accept, Content-Type, Authorization, Content-Length, X-Requested-With');
	if ('OPTIONS' == req.method) {
		res.status(200).end();
	}
	else {
		next();
	}
});

app.use(function (req, res, next) {
	var c = req.session.credentials;
	if (req.url.indexOf('/login') == 0 || req.url.indexOf('/logout') == 0 || (c && c.isAuthorized)) {
		if (req.url.indexOf('/login') != 0) {
			req.jira = new JiraApi(c.protocol, c.hostname, c.port, c.username, c.password, c.apiVersion);
		}
		next();
	}
	else {
		res.status(401).end('Unauthorized!');
	}
});

app.get('/isAuthorized', function (req, res) {
	res.json({
		isAuthorized: true,
		name: req.session.credentials.displayName
	});
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

app.post('/login', function (req, res) {
	var username = req.body.username || '';
	var password = req.body.password || '';
	var c = req.session.credentials = {
		username: username,
		password: password,
		protocol: 'https',
		port: 443,
		hostname: jiraBaseUrl,
		apiVersion: 2,
		isAuthorized: false
	};
	var jira = new JiraApi(c.protocol, c.hostname, c.port, c.username, c.password, c.apiVersion);
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
		}, function (error, resp) {
			if (error) {
				res.status(400).json(error);
				return true;
			}
			res.json(issue);
		});
	});
});

app.post('/testcomment', function (req, res) {
	var c = req.session.credentials;
	var pageId = req.body.pageId;
	var pageVersion = req.body.pageVersion;
	var issueKey = req.body.issueKey;
	var comment = req.body.comment;
	var img = req.body.img;
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

app.post('/testchangestatus', function (req, res) {
	var newStatusId;
	var issueKey = req.body.issueKey;
	var status = req.body.status;
	var statusIds = {
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
	var pageId = req.query.pageId;
	var pageVersion = req.query.pageVersion;
	var issueKey = req.query.issueKey;
	if (!pageId || !pageVersion || !issueKey) {
		res.status(400).end('missing parameters');
		return;
	}
	Context.findOne({pageId: pageId, pageVersion: pageVersion, issueKey: issueKey})
	.populate({path: 'tests', select: 'testId testStatus'}).exec(function (err, doc) {
		if (err) {
			res.status(500).end(err);
			return;
		}
		if (doc) {
			res.json({tests: doc.tests});
		}
		else {
			res.json({});
		}
	});
});

app.post('/savetest', function (req, res) {
	var test;
	var pageId = req.body.pageId;
	var pageVersion = req.body.pageVersion;
	var issueKey = req.body.issueKey;
	var testId = req.body.testId;
	var testStatus = req.body.testStatus || '';
	if (!pageId || !pageVersion || !issueKey || !testId) {
		res.status(400).end('missing parameters');
		return;
	}
	Context.findOne({pageId: pageId, pageVersion: pageVersion, issueKey: issueKey})
		.populate({path: 'tests', match: {testId: testId}}).exec(function (err, doc) {
		if (err) {
			res.status(500).end(err);
			return;
		}
		if (doc) {
			if (doc.tests[0]) {
				doc.tests[0].testStatus = testStatus;
				doc.tests[0].save(function (err, test) {
					if (err) {
						res.status(500).end(err);
						return;
					}
					res.json({ testId: test.testId, testStatus: test.testStatus });
				});
			}
			else {
				test = new Test({testId: testId, testStatus: testStatus, context: doc});
				test.save(function (err, test) {
					if (err) {
						res.status(500).end(err);
						return;
					}
					doc.tests.push(test);
					doc.save(function (err, doc) {
						if (err) {
							res.status(500).end(err);
							return;
						}
						res.json({ testId: test.testId, testStatus: test.testStatus });
					});
				});
			}
		}
		else {
			var context = Context({pageId: pageId, pageVersion: pageVersion, issueKey: issueKey});
			context.save(function (err, doc) {
				if (err) {
					res.status(500).end(err);
					return;
				}
				test = new Test({testId: testId, testStatus: testStatus, context: doc});
				test.save(function (err, test) {
					if (err) {
						res.status(500).end(err);
						return;
					}
					doc.tests.push(test);
					doc.save(function (err, doc) {
						if (err) {
							res.status(500).end(err);
							return;
						}
						res.json({ testId: test.testId, testStatus: test.testStatus });
					});
				});
			});
		}
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
		url: 'https://' + c.username + ':' + c.password + '@' + jiraBaseUrl + '/rest/api/2/issue/' + issueKey + '/attachments',
		formData: formData,
		headers: {
			'X-Atlassian-Token': 'nocheck'
		}
	}, function (error, response, body) {
		cb(error);
	});
}

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
		res.status(err.status || 500).json(err);
	});
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
	res.status(err.status || 500).end(err.message);
});

module.exports = app;