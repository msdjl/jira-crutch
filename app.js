var express = require('express');
var session = require('express-session');
var path = require('path');
var logger = require('morgan');
var compress = require('compression');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var https = require('https');
var request = require('request');
var app = express();
var phantom = require('phantom');
var JiraApi = require('jira').JiraApi;
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
	store: new MongoStore({
		url: 'mongodb://localhost/test'
	})
}));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(logger('dev'));
app.use(compress());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(require('stylus').middleware(path.join(__dirname, 'public')));
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
		next();
	}
	else {
		res.status(401).end('Unauthorized!');
		return true;
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
	var c = req.session.credentials;
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
	var hostname = req.body.hostname || 'jira.returnonintelligence.com';
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
	jira.getCurrentUser(function (error, user) {
		if (error) {
			console.log(error);
			res.status(401).end(error);
			return true;
		}
		c.isAuthorized = true;
		c.displayName = user.name;
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
	var s = req.body.issue;
	if (!s) {
		res.status(400).end('missing parameter');
		return true;
	}
	var jira = new JiraApi(c.protocol, c.hostname, c.port, c.username, c.password, c.apiVersion);
	jira.addNewIssue(s, function(error, issue) {
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
	if (!pageId || !pageVersion || !issueKey || !comment) {
		res.status(400).end('missing parameters');
		return;
	}
	var jira = new JiraApi(c.protocol, c.hostname, c.port, c.username, c.password, c.apiVersion);
	jira.addComment(issueKey, comment, function(error) {
		if (error) {
			res.status(400).json(error);
			return true;
		}
		wikiScreenshot(pageId, pageVersion, issueKey, c, function (err, img) {
			if (err) {
				console.log('wikiScreenshot', err);
				return;
			}
			attachScreenshot (pageId, pageVersion, issueKey, c, img, function (err) {
				if (err) {
					console.log('attachScreenshot', err);
				}
			});
		});
		res.json({issueKey: issueKey, comment: comment});
	});
});

app.post('/testchangestatus', function (req, res) {
	var newStatusId;
	var c = req.session.credentials;
	var issueKey = req.body.issueKey;
	var status = req.body.status;
	if (!issueKey || !status) {
		res.status(400).end('missing parameters');
		return;
	}
	if (status == 'Passed') {
		newStatusId = '51';
	}
	else if (status == 'Failed') {
		newStatusId = '201';
	}
	else {
		res.status(400).end('incorrect status');
		return;
	}
	var newSettings = {
		transition: {
			id: newStatusId
		}
	};
	var jira = new JiraApi(c.protocol, c.hostname, c.port, c.username, c.password, c.apiVersion);
	jira.transitionIssue(issueKey, newSettings, function(error) {
		if (error) {
			res.status(400).json(error);
			return true;
		}
		res.json({issueKey: issueKey});
	});
});

app.get('/gettests', function (req, res) {
	var c = req.session.credentials;
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
	var c = req.session.credentials;
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
		url: 'https://' + c.username + ':' + c.password + '@jira.returnonintelligence.com/rest/api/2/issue/' + issueKey + '/attachments',
		formData: formData,
		headers: {
			'X-Atlassian-Token': 'nocheck'
		}
	}, function (error, response, body) {
		cb(error);
	});
}

function wikiScreenshot (pageId, pageVersion, issueKey, credentials, cb) {
	var baseUrl = 'https://wiki.returnonintelligence.com/';
	var loginPage = 'dologin.action';
	var viewPage = 'pages/viewpage.action';
	var historyPage = 'pages/viewpreviousversions.action';
	var query = '?pageId=';
	var c = credentials;
	var loginSettings = {
		os_username: c.username,
		os_password: c.password,
		os_destination: baseUrl + historyPage + query + pageId
	};
	var loginSettingsStr = '';
	for (var i in loginSettings) {
		loginSettingsStr += i + '=' + loginSettings[i] + '&';
	}
	phantom.create(function (ph) {
		ph.createPage(function (page) {
			page.set('viewportSize', {width: 1500, height: 1000});
			page.open(baseUrl + loginPage, 'POST', loginSettingsStr, function () {
				page.evaluate(function (pageVersion) {
					return $('#rowForVersion' + pageVersion + ' a:first').attr('href').split('=')[1];
				}, function (specifiedVersionId) {
					page.open(baseUrl + viewPage + query + specifiedVersionId, function () {
						var tests = {};
						Context.findOne({pageId: pageId, pageVersion: pageVersion, issueKey: issueKey})
							.populate({path: 'tests', select: 'testId testStatus'}).exec(function (err, doc) {
								if (err) {
									return cb(err);
								}
								if (doc) {
									for (var i in doc.tests) {
										tests[doc.tests[i].testId] = doc.tests[i].testStatus;
									}
									page.evaluate(fixWikiPage, function () {
										page.renderBase64('PNG', function (img) {
											cb(null, img);
											ph.exit();
										});
									}, tests);
								}
								else {
									cb(':(');
									ph.exit();
								}
							});
					});
				}, pageVersion);
			});
		});
	});
}

function fixWikiPage (tests, body) {
	tests = tests || {};
	body = $(body || window.document.body);
	body.html(body.find('#main').html());
	body.find('#comments-section, #likes-and-labels-container, #navigation, #page-history-warning').remove();
	body.find('.table-wrap').each(function (n, el) {
		$(el).css('overflow', 'visible');
	});
	body.parent().css('padding', '10px').css('backgroundColor', 'white');
	body.css('overflow', 'visible').css('backgroundColor', 'white');
	body.find('tbody tr').find('td:first').each(function (n, el) {
		var status = tests[n] || '';
		var tr = $(el).parent();
		if (status == 'Passed') {
			tr.css('backgroundColor', 'rgb(223, 240, 216)');
		}
		else if (status == 'Failed') {
			tr.css('backgroundColor', 'rgb(242, 222, 222)');
		}
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