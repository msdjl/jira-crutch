var app = angular.module ('app', ['ngRoute', 'ngAnimate', 'ngCookies', 'ui.bootstrap']).config(function($routeProvider) {
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
	$routeProvider.otherwise({
		redirectTo: '/'
	});

});

app.controller ('appCtrl', function ($scope, $location, $cookies) {
	$scope.$on('$locationChangeStart', function (event, newUrl, oldUrl) {
		console.log(arguments)
	});
	if (!$cookies.isAuthorized) {
		$location.path('/login');
	}
});

app.factory ('AuthService', function () {
	var isAuthenticated = false;
	return {
		logged: function () {
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
			$location.path('/');
		}).error(function() {
			$('#overlap').hide();
			$('#throbber').hide();
			alert('error');
			console.log(arguments);
		});
	};
});

app.controller ('IssueController', function ($scope, $http, $location, $routeParams, AuthService) {
	//$location.path('/login');
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
		for (f in filerTo) {
			if (str.indexOf(filerTo[f]) > -1)
				return styles[f];
		}
		return styles[0];
	};

	$scope.removeSubtask = function () {
		for (s in $scope.subtasks) {
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

	$scope.subtasksfilter = function (actual, expected) {
		var str = actual.fields.summary.toLowerCase();
		var filerTo = ['[tc]', '[test]', '[req]', '[auto]'];
		for (f in filerTo) {
			if (str.indexOf(filerTo[f]) > -1)
				return true;
		}
	};

	$scope.changeTaskType = function (type) {
		this.subtask.fields.__type = type;
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
				var newSub = {
					fields: {
						summary: sub.fields.__type + ' ' + sub.fields.summary,
						description: sub.fields.description,
						project: {
							key: main.fields.project.key
						},
						issuetype: {
							id: 56 // test task
						},
						customfield_13245: main.fields.customfield_13245 || [
							{id: '17706'}
						], // brick || other
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
					var res = arguments[0];
					//alert(JSON.stringify(res));
					$scope.resps++;
					$scope.dynamic++;
					//sub.fields.__key = res.key;
					//sub.fields.__saved = true;
					if ($scope.reqs == $scope.resps) {
						$('#throbber').hide();
						$('#overlap').hide();
					}
					console.log(Math.round($scope.resps * (100 / $scope.reqs)) + '%');
				}).error(function (err) {
					//alert(JSON.stringify(err));
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
		var res = arguments[0];
	//	if (typeof (res) == 'string') {
		//	res = JSON.parse(res);
	//	}
		$scope.issue = res;
		$scope.addSubtask(true);
		$('#overlap').hide();
		$('#throbber').hide();
		/*$( ".container" ).animate({
			opacity: 1
		}, 300);*/
	}).error(function() {
		$('#overlap').hide();
		$('#throbber').hide();
		console.log(arguments);
		alert('error');
		$location.path('/');
	});
});