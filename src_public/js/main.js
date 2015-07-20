var app = angular.module ('app', ['ngRoute']).config(['$routeProvider', function($routeProvider) {
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
}]);

app.controller ('appCtrl', ['$rootScope','$scope', '$location', '$http', function ($rootScope, $scope, $location, $http) {
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
		$('#expander:not(.collapsed)').click();
	});

	//TODO: move this to directive
	$rootScope.toggleThrobber = function(state) {
		var throbber = $('#overlap, #throbber');
		(state ? throbber.show() : throbber.hide());
	};
}]);

app.controller ('HomeController', ['$scope', '$http', '$location', function ($scope, $http, $location) {
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
}]);

app.controller ('LoginController', ['$scope', '$http', '$location', function ($scope, $http, $location) {
	$scope.login = function () {
		$scope.toggleThrobber(true);
		$http({method: 'POST', url: '/login/', data: {
			username: $scope.username,
			password: $scope.password
		}}).success(function() {
			$scope.$parent.isAuthorized = true;
			$location.path('/');
		}).error(function() {
			$scope.$parent.isAuthorized = false;
			alert('error');
			console.log(arguments);
		})
		.finally(function() {
			$scope.toggleThrobber(false);
		});
	};
}]);