app.controller ('ChecklistMakerController', ['$scope', '$http', function ($scope, $http) {
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
		$scope.toggleThrobber(true);
		$http({method: 'GET', url: '/rest/api/latest/search?jql=' + $scope.query}).success(function() {
			$scope.jout = arguments[0];
		}).error(function() {
			console.log(arguments);
			alert('error');
		})
			.finally(function() {
				$scope.toggleThrobber(false);
			});
	};
	$scope.extendDelimiters = function (arr) {
		var res = [], tmp = [], i;
		for (i in arr) {
			if (!arr.hasOwnProperty(i)) continue;
			tmp.push('*' + arr[i] + ':*');
			tmp.push('*' + arr[i] + '*:');
			tmp.push('*' + arr[i] + '*');
			tmp.push(arr[i] + ':');
		}
		for (i in tmp) {
			if (!tmp.hasOwnProperty(i)) continue;
			res.push('\n' + tmp[i] + '\n');
			res.push('\n' + tmp[i]);
			res.push(tmp[i] + '\n');
			res.push(tmp[i]);
		}
		return res;
	};
	$scope.getDelimiterPosition = function (text, dels_arr, from) {
		var i, pos, dels = $scope.extendDelimiters(dels_arr.split('\n'));
		text = text || "";
		for (i in dels) {
			if (!dels.hasOwnProperty(i)) continue;
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
		text || (text = "");
		var res,
			st_pos = $scope.getDelimiterPosition(text, $scope.steps_Delimiters);
		res = text.substring(0, st_pos.start != -1 ? st_pos.start : undefined);
		return res;
	};
	$scope.getSteps = function (text) {
		text || (text = "");
		var res,
			st_pos = $scope.getDelimiterPosition(text, $scope.steps_Delimiters),
			er_pos = $scope.getDelimiterPosition(text, $scope.er_Delimiters, st_pos.start != -1 ? st_pos.end : undefined);
		res = text.substring(st_pos.start != -1 ? st_pos.end : 0, er_pos.start != -1 ? er_pos.start : undefined);
		return res;
	};
	$scope.getERs = function (text) {
		text || (text = "");
		var res,
			st_pos = $scope.getDelimiterPosition(text, $scope.steps_Delimiters),
			er_pos = $scope.getDelimiterPosition(text, $scope.er_Delimiters, st_pos.start != -1 ? st_pos.end : undefined);
		res = text.substring(er_pos.start != -1 ? er_pos.end : undefined);
		return res;
	};
}]);