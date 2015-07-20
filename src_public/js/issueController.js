app.controller ('IssueController', ['$scope', '$http', '$location', '$routeParams', function ($scope, $http, $location, $routeParams) {
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
			if (filerTo.hasOwnProperty(f) && str.indexOf(filerTo[f]) > -1)
				return styles[f];
		}
		return styles[0];
	};

	$scope.removeSubtask = function () {
		for (var s in $scope.subtasks) {
			if (!$scope.subtasks.hasOwnProperty(s)) continue;
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
			if (filerTo.hasOwnProperty(f) && str.indexOf(filerTo[f]) > -1)
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
			$scope.toggleThrobber(true);
			for (var i in $scope.subtasks) {
				if (!$scope.subtasks.hasOwnProperty(i)) continue;
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

				$http({method: 'POST', url: '/rest/api/latest/subtask/', data: {issue: newSub}})
					.success(function () {
						console.log(Math.round($scope.resps * (100 / $scope.reqs)) + '%');
					})
					.error(function (err) {
						console.log(err);
						console.log(Math.round($scope.resps * (100 / $scope.reqs)) + '%');
					})
					.finally(function() {
						$scope.resps++;
						$scope.dynamic++;
						if ($scope.reqs == $scope.resps) {
							$scope.toggleThrobber(false);
						}
					});
			}
		}
		else {
			alert('0 subtasks here. Nothing to do.');
		}
	};

	$scope.toggleThrobber(true);
	$http({method: 'GET', url: '/rest/api/latest/issue/' + $routeParams.issue})
		.success(function() {
			$scope.issue = arguments[0];
			$scope.addSubtask(true);
		})
		.error(function() {
			console.log(arguments);
			alert('error');
			$location.path('/');
		})
		.finally(function() {
			$scope.toggleThrobber(false);
		});
}]);