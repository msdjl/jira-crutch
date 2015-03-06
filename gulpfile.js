var gulp = require('gulp');
var uglify = require('gulp-uglify');
var uglifycss = require('gulp-uglifycss');
var minifyHTML = require('gulp-minify-html');
var imagemin = require('gulp-imagemin');
var pngquant = require('imagemin-pngquant');
var jade = require('gulp-jade');

gulp.task('js', function () {
	gulp.src('public/src/js/*.js')
		.pipe(uglify())
		.pipe(gulp.dest('public/js'));
});

gulp.task('css', function () {
	gulp.src('public/src/css/*.css')
		.pipe(uglifycss())
		.pipe(gulp.dest('public/css'));
});

gulp.task('jade', function () {
	gulp.src('public/src/**/*.jade')
		.pipe(jade({pretty: false}))
		.pipe(gulp.dest('public'));
});

gulp.task('html', function () {
	gulp.src('public/src/**/*.html')
		.pipe(minifyHTML())
		.pipe(gulp.dest('public'));
});

gulp.task('img', function () {
	gulp.src('public/src/img/*')
		.pipe(imagemin({
			progressive: true,
			interlaced: true,
			use: [pngquant()]
		}))
		.pipe(gulp.dest('public/img'));
});

gulp.task('default', ['js', 'css', 'jade', 'img']);