var app = angular.module ('app', ['ngRoute']).config(function($routeProvider) {
	$routeProvider.when('/', {
		templateUrl: 'templates/home.html',
		controller: 'HomeController'
	});
	$routeProvider.when('/login', {
		templateUrl: 'templates/login.html',
		controller: 'LoginController'
	});
	$routeProvider.when('/issue/:issue', {
		templateUrl: 'templates/issue.html',
		controller: 'IssueController'
	});
	$routeProvider.when('/checklistmaker', {
		templateUrl: 'templates/checklist_maker.html',
		controller: 'ChecklistMakerController'
	});
	$routeProvider.otherwise({
		redirectTo: '/'
	});

});

app.controller ('appCtrl', function ($scope, $location, $http) {
	$scope.isAuthorized = true;
	$http({method: 'GET', url: '/isAuthorized'}).success(function() {
		$scope.isAuthorized = true;
	}).error(function() {
		$scope.isAuthorized = false;
		$location.path('/login');
	});
	$scope.$on('$locationChangeStart', function (event, newUrl, oldUrl) {
		console.log(arguments);
		if (newUrl.indexOf('/login') == -1) {
			if (!$scope.isAuthorized) {
				event.preventDefault();
				$location.path('/login');
			}
		}
	});

});

app.factory ('AuthService', function () {
	var isAuthenticated = false;
	return {
		isAuthorized: function () {
			return isAuthenticated;
		},
		login: function () {
			isAuthenticated = true;
		},
		logout: function () {
			isAuthenticated = false;
		}
	}
});

app.controller ('ChecklistMakerController', function ($scope, $http) {
	$scope.query = '';
	$scope.resFilter = {
		include: '',
		exclude: ''
	};
	$scope.steps_Delimiters = [ 'steps', 'actions', 'action' ].join('\n');
	$scope.er_Delimiters = [ 'expected results', 'expected result', 'ers', 'er' ].join('\n');
	$scope.hidePreconditions = true;
	$scope.hideNumbers = true;
	$scope.hideSummary = true;
	$scope.jout = {};
	$scope.showSettings = false;
	$scope.toggleShowSettings = function () {
		$scope.showSettings = !$scope.showSettings;
	};
	$scope.findIssues = function () {
		$('#overlap').show();
		$('#throbber').show();
		$http({method: 'GET', url: '/rest/api/latest/search?jql=' + $scope.query}).success(function() {
			$scope.jout = arguments[0];
			$('#overlap').hide();
			$('#throbber').hide();
		}).error(function() {
			$('#overlap').hide();
			$('#throbber').hide();
			console.log(arguments);
			alert('error');
		});
	};
	$scope.extendDelimiters = function (arr) {
		var res = [], tmp = [], i;
		for (i in arr) {
			tmp.push('*' + arr[i] + ':*');
			tmp.push('*' + arr[i] + '*:');
			tmp.push('*' + arr[i] + '*');
			tmp.push(arr[i] + ':');
		}
		for (i in tmp) {
			res.push('\n' + tmp[i] + '\n');
			res.push('\n' + tmp[i]);
			res.push(tmp[i] + '\n');
			res.push(tmp[i]);
		}
		return res;
	};
	$scope.getDelimiterPosition = function (text, dels_arr, from) {
		var i, pos, dels = $scope.extendDelimiters(dels_arr.split('\n'));
		for (i in dels) {
			pos = text.toLowerCase().indexOf(dels[i].toLowerCase(), from);
			if (pos != -1) {
				break;
			}
		}
		return {
			start: pos,
			end: pos + dels[i].length
		};
	};
	$scope.getPreconditions = function (text) {
		var res,
			st_pos = $scope.getDelimiterPosition(text, $scope.steps_Delimiters);
		res = text.substring(0, st_pos.start != -1 ? st_pos.start : undefined);
		return res;
	};
	$scope.getSteps = function (text) {
		var res,
			st_pos = $scope.getDelimiterPosition(text, $scope.steps_Delimiters),
			er_pos = $scope.getDelimiterPosition(text, $scope.er_Delimiters, st_pos.start != -1 ? st_pos.end : undefined);
		res = text.substring(st_pos.start != -1 ? st_pos.end : 0, er_pos.start != -1 ? er_pos.start : undefined);
		return res;
	};
	$scope.getERs = function (text) {
		var res,
			st_pos = $scope.getDelimiterPosition(text, $scope.steps_Delimiters),
			er_pos = $scope.getDelimiterPosition(text, $scope.er_Delimiters, st_pos.start != -1 ? st_pos.end : undefined);
		res = text.substring(er_pos.start != -1 ? er_pos.end : undefined);
		return res;
	};
});

app.controller ('HomeController', function ($scope, $http, $location) {
	$scope.issue = '';
	$scope.openIssue = function () {
		$location.path('/issue/' + $scope.issue);
	};

	$scope.logout = function () {
		$http({method: 'POST', url: '/logout/'}).success(function() {
			$location.path('/login');
		}).error(function() {
			alert('error');
			console.log(arguments);
		});
	};
});

app.controller ('LoginController', function ($scope, $http, $location) {
	$scope.login = function () {
		$('#overlap').show();
		$('#throbber').show();
		$http({method: 'POST', url: '/login/', data: {
			username: $scope.username,
			password: $scope.password
		}}).success(function() {
			$('#overlap').hide();
			$('#throbber').hide();
			$scope.$parent.isAuthorized = true;
			$location.path('/');
		}).error(function() {
			$('#overlap').hide();
			$('#throbber').hide();
			$scope.$parent.isAuthorized = false;
			alert('error');
			console.log(arguments);
		});
	};
});

app.controller ('IssueController', function ($scope, $http, $location, $routeParams) {
	$scope.issue = {};
	$scope.subtasks = [];

	$scope.addSubtask = function (notScroll) {
		var newType = '[tc] ';
		if ($scope.subtasks.length > 0) {
			newType = $scope.subtasks[$scope.subtasks.length - 1].fields.__type == '[tc] ' ? '[test] ' : '[tc] ';
		}
		$scope.subtasks.push({
			fields: {
				summary: $scope.issue.fields.summary,
				__type: newType,
				__priority: $scope.issue.fields.priority.name,
				__statusText: 'Saved as',
				__key: '',
				__saved: false
			}
		});
		if (!notScroll) {
			setTimeout(function () {
				$( "body" ).animate({
					scrollTop: document.body.scrollHeight
				}, 500);
			}, 1);
		}
	};

	$scope.getSubtaskStyle = function (task) {
		var str = task.fields.summary.toLowerCase();
		var filerTo = ['[tc]', '[test]', '[req]', '[auto]'];
		var styles = ['success', 'warning', 'info', 'danger'];
		for (var f in filerTo) {
			if (str.indexOf(filerTo[f]) > -1)
				return styles[f];
		}
		return styles[0];
	};

	$scope.removeSubtask = function () {
		for (var s in $scope.subtasks) {
			if (this.subtask['$$hashKey'] == $scope.subtasks[s]['$$hashKey']) {
				(function() {
					$( "#subtask" + s ).animate({
						left: -window.outerWidth
					}, 500, function() {
						$( "#subtask" + s ).animate({
							height: 0
						}, 200, function() {
							$scope.subtasks.splice(s, 1);
							$scope.$digest();
						});
					});
				})();
				return;
			}
		}
	};

	$scope.subtasksfilter = function (actual) {
		var str = actual.fields.summary.toLowerCase();
		var filerTo = ['[tc]', '[test]', '[req]', '[auto]'];
		for (var f in filerTo) {
			if (str.indexOf(filerTo[f]) > -1)
				return true;
		}
	};

	$scope.changeTaskType = function (type) {
		this.subtask.fields.__type = type;
	};

	$scope.changeTaskPriority = function (priority) {
		this.subtask.fields.__priority = priority;
	};

	$scope.reqs = $scope.max = 0;
	$scope.resps = $scope.dynamic = 0;
	$scope.save = function () {
		$scope.reqs = $scope.max = $scope.subtasks.length;
		$scope.resps = 0;
		var main = $scope.issue;
		console.log($scope.subtasks.length + ' subtask need create');
		if ($scope.subtasks.length > 0) {
			$('#overlap').show();
			$('#throbber').show();
			for (var i in $scope.subtasks) {
				var sub = $scope.subtasks[i];
				var priorityVals = {
					'Blocker': '1',
					'Critical': '2',
					'Major': '3',
					'Minor': '4',
					'Trivial': '5'
				};
				var newSub = {
					fields: {
						summary: sub.fields.__type + ' ' + sub.fields.summary,
						priority: {
							id: priorityVals[sub.fields.__priority]
						},
						description: sub.fields.description,
						project: {
							key: main.fields.project.key
						},
						issuetype: {
							id: 56 // test task
						},
						parent: {
							key: main.key
						},
						customfield_10890: main.fields.customfield_10890 || [
							{id: '17669'}
						], // functional area || other
						fixVersions: main.fields.fixVersions,
						timetracking: {
							originalEstimate: sub.fields.originalEstimate || '0h',
							remainingEstimate: sub.fields.originalEstimate || '0h'
						}
					}
				};

				$http({method: 'POST', url: '/rest/api/latest/subtask/', data: {issue: newSub}}).success(function () {
					$scope.resps++;
					$scope.dynamic++;
					if ($scope.reqs == $scope.resps) {
						$('#throbber').hide();
						$('#overlap').hide();
					}
					console.log(Math.round($scope.resps * (100 / $scope.reqs)) + '%');
				}).error(function (err) {
					console.log(err);
					$scope.resps++;
					$scope.dynamic++;
					if ($scope.reqs == $scope.resps) {
						$('#throbber').hide();
						$('#overlap').hide();
					}
					console.log(Math.round($scope.resps * (100 / $scope.reqs)) + '%');
				});
			}
		}
		else {
			alert('0 subtasks here. Nothing to do.');
		}
	};

	$('#overlap').show();
	$('#throbber').show();
	$http({method: 'GET', url: '/rest/api/latest/issue/' + $routeParams.issue}).success(function() {
		$scope.issue = arguments[0];
		$scope.addSubtask(true);
		$('#overlap').hide();
		$('#throbber').hide();
	}).error(function() {
		$('#overlap').hide();
		$('#throbber').hide();
		console.log(arguments);
		alert('error');
		$location.path('/');
	});
});